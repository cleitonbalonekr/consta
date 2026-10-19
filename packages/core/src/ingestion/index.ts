import type { CaseFileLifecycle, IngestionTarget, UnreadPages } from "../case-files";
import type { Metering } from "../metering";
import type { Embedder, FileStore, UnitOfWork } from "../ports";
import { PageRange } from "../shared";
import type { CaseFileId } from "../shared";
import type { Page, PageRecord } from "./page";
import { PdfPageReader } from "./pdf-page-reader";

export type { Block, PageRecord } from "./page";
export { PAGES_PER_BATCH } from "./pdf-page-reader";

/** Pages per range. One task ingests one range. */
export const PAGES_PER_RANGE = 100;

/** A failed range runs again three times (prd-mvp.md, F3) before the case file fails. */
export const RANGE_ATTEMPTS = 4;

/** A passage with its embedding, as the Ingestion repository stores it. */
export type PassageRecord = { page: number; text: string; embedding: number[]; embeddingModel: string; blockIndexes: number[] };

/** Ingestion's tables, behind a port so the module holds no SQL (ADR-0006). */
export interface IngestionRepository {
  /** Records the ranges of a plan. A range already recorded stays as it is. */
  addRanges(caseFileId: CaseFileId, ranges: PageRange[]): Promise<void>;
  /** Marks the range running and counts one more attempt. */
  startRange(caseFileId: CaseFileId, range: PageRange): Promise<void>;
  finishRange(caseFileId: CaseFileId, range: PageRange): Promise<void>;
  /** How many of the case file's ranges are not done. */
  countUnfinishedRanges(caseFileId: CaseFileId): Promise<number>;
  /** Deletes the pages of the range, and their passages with them. */
  removePages(caseFileId: CaseFileId, range: PageRange): Promise<void>;
  /** Stores pages and the passages on them. Every passage's page is in `pages`. */
  savePages(caseFileId: CaseFileId, pages: PageRecord[], passages: PassageRecord[]): Promise<void>;
  countPages(caseFileId: CaseFileId): Promise<number>;
  /** The numbers of the case file's scanned pages, in order. */
  scannedPages(caseFileId: CaseFileId): Promise<number[]>;
}

export type IngestionDeps = {
  uow: UnitOfWork;
  files: FileStore;
  embedder: Embedder;
  metering: Metering;
  lifecycle: CaseFileLifecycle;
};

/**
 * Turns an uploaded case file into pages and passages, and, from ticket 09, a document map and facts.
 *
 * Call order: `plan`, then `ingestRange` for every range (in parallel), then `map`;
 * `fail` when a step fails for good. Every step is idempotent, so a runner may retry any of them.
 */
export class Ingestion {
  private readonly uow: UnitOfWork;
  private readonly embedder: Embedder;
  private readonly metering: Metering;
  private readonly lifecycle: CaseFileLifecycle;
  private readonly reader: PdfPageReader;

  constructor({ uow, files, embedder, metering, lifecycle }: IngestionDeps) {
    this.uow = uow;
    this.embedder = embedder;
    this.metering = metering;
    this.lifecycle = lifecycle;
    this.reader = new PdfPageReader(files);
  }

  /** The failure reason a lawyer reads when a step other than a range fails for good. */
  static readonly unreadableFileReason = "Não conseguimos ler este arquivo.";

  /** The failure reason a lawyer reads when ranges could not be read after every attempt. */
  static unreadRangesReason(ranges: PageRange[]): string {
    const pages = ranges.map(({ first, last }) => (first === last ? `${first}` : `${first} a ${last}`));
    const listed = pages.length === 1 ? pages[0] : `${pages.slice(0, -1).join(", ")} e ${pages.at(-1)}`;
    const word = ranges.length === 1 && ranges[0]!.first === ranges[0]!.last ? "a página" : "as páginas";
    return `Não conseguimos ler ${word} ${listed}.`;
  }

  /** Splits the case file into ranges of PAGES_PER_RANGE pages and records them. */
  async plan(caseFileId: CaseFileId): Promise<PageRange[]> {
    const { pageCount } = await this.lifecycle.target(caseFileId);
    const ranges: PageRange[] = [];
    for (let first = 1; first <= pageCount; first += PAGES_PER_RANGE) {
      ranges.push(PageRange.from(first, Math.min(first + PAGES_PER_RANGE - 1, pageCount)));
    }
    await this.uow.run((repos) => repos.ingestion.addRanges(caseFileId, ranges));
    return ranges;
  }

  /**
   * Reads, classifies, splits and embeds the pages of one range, and moves the progress
   * after every PAGES_PER_BATCH pages. A retry replaces that range's pages and passages only.
   */
  async ingestRange(caseFileId: CaseFileId, range: PageRange): Promise<void> {
    const target = await this.lifecycle.target(caseFileId);
    await this.uow.run(async (repos) => {
      await this.lifecycle.startProcessing(caseFileId);
      await repos.ingestion.startRange(caseFileId, range);
      await repos.ingestion.removePages(caseFileId, range);
    });
    await this.reader.read(target.storageKey, target.sizeBytes, range, (pages) => this.save(caseFileId, target, pages));
    await this.uow.run((repos) => repos.ingestion.finishRange(caseFileId, range));
  }

  /**
   * Marks the case file ready, with the scanned pages it did not read. Ticket 09 builds
   * the document map and facts here first; until then the document map is empty.
   * Throws when a range is not done.
   */
  async map(caseFileId: CaseFileId): Promise<void> {
    if ((await this.lifecycle.target(caseFileId)).status === "ready") return;
    const scanned = await this.uow.run(async (repos) => {
      const unfinished = await repos.ingestion.countUnfinishedRanges(caseFileId);
      if (unfinished > 0) throw new Error(`Case file ${caseFileId} has ${unfinished} ranges not done.`);
      await this.lifecycle.startMapping(caseFileId);
      return repos.ingestion.scannedPages(caseFileId);
    });
    await this.lifecycle.markReady(caseFileId, toRanges(scanned));
  }

  /** Marks the case file failed with a reason the lawyer can read, and gives its pages back to the quota. */
  async fail(caseFileId: CaseFileId, reason: string): Promise<void> {
    await this.uow.run(async () => {
      await this.lifecycle.fail(caseFileId, reason);
      await this.metering.givePagesBack(caseFileId);
    });
  }

  /**
   * Runs every step in order, in-process, with RANGE_ATTEMPTS per range, and calls `fail`
   * when a step fails for good. The inline `Jobs` adapter uses it; the Trigger.dev tasks
   * run the ranges in parallel instead. Rethrows the error after `fail`.
   */
  async ingestAll(caseFileId: CaseFileId): Promise<void> {
    try {
      for (const range of await this.plan(caseFileId)) await this.withAttempts(caseFileId, range);
      await this.map(caseFileId);
    } catch (error) {
      const reason = error instanceof UnreadRange ? Ingestion.unreadRangesReason([error.range]) : Ingestion.unreadableFileReason;
      await this.fail(caseFileId, reason);
      throw error instanceof UnreadRange ? error.cause : error;
    }
  }

  private async withAttempts(caseFileId: CaseFileId, range: PageRange) {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.ingestRange(caseFileId, range);
      } catch (error) {
        if (attempt === RANGE_ATTEMPTS) throw new UnreadRange(range, error);
      }
    }
  }

  /** The embedding call comes first and its cost is recorded at once, so the run holds only database work. */
  private async save(caseFileId: CaseFileId, target: IngestionTarget, pages: Page[]) {
    const drafts = pages.flatMap((page) => page.passages());
    const vectors = drafts.length > 0 ? await this.embed(caseFileId, target, drafts.map((draft) => draft.text)) : [];
    const passages = drafts.map((draft, i) => ({ ...draft, embedding: vectors[i]!, embeddingModel: this.embedder.model }));
    await this.uow.run(async (repos) => {
      await repos.ingestion.savePages(caseFileId, pages.map((page) => page.record()), passages);
      await this.lifecycle.recordPagesRead(caseFileId, await repos.ingestion.countPages(caseFileId));
    });
  }

  private async embed(caseFileId: CaseFileId, target: IngestionTarget, texts: string[]) {
    const { vectors, usage } = await this.embedder.embed(texts, "passage");
    await this.metering.record(target.lawyer, caseFileId, usage);
    if (vectors.length !== texts.length) throw new Error(`The embedder returned ${vectors.length} vectors for ${texts.length} passages.`);
    return vectors;
  }
}

/** A range that failed on every attempt. */
class UnreadRange extends Error {
  constructor(
    readonly range: PageRange,
    override readonly cause: unknown,
  ) {
    super(`Pages ${range.first} to ${range.last} failed ${RANGE_ATTEMPTS} times.`);
  }
}

/** [3, 4, 5, 9] as 3 to 5 and 9 to 9. */
function toRanges(pages: number[]): UnreadPages {
  const ranges: UnreadPages = [];
  for (const page of pages) {
    const last = ranges.at(-1);
    if (last && last.last + 1 === page) last.last = page;
    else ranges.push({ first: page, last: page });
  }
  return ranges;
}
