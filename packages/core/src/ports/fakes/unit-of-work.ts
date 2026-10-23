import { AsyncLocalStorage } from "node:async_hooks";
import type { AnsweringRepository, FoundPassage, PecaPage, QuestionRecord, RankedPassages } from "../../answering";
import { CaseFile } from "../../case-files";
import type { CaseFileProps, CaseFileRepository, Folhas, PecaView } from "../../case-files";
import type { IngestionRepository, PageRecord, PassageRecord } from "../../ingestion";
import type { LawyerPlan, MeteringRepository, QuotaCharge } from "../../metering";
import { PecaId } from "../../shared";
import type { CaseFileId, LawyerId, PageRange } from "../../shared";
import type { FactDraft, PecaDraft } from "../map-extractor";
import type { Repositories, UnitOfWork } from "../unit-of-work";
import type { Usage } from "../usage";

/** The in-memory tables. Tests may seed rows that no repository method writes yet. */
export type InMemoryState = {
  caseFiles: Map<CaseFileId, CaseFileProps>;
  ingestion: {
    ranges: { caseFileId: CaseFileId; first: number; last: number; status: "pending" | "running" | "done"; attempts: number }[];
    pages: (PageRecord & { caseFileId: CaseFileId })[];
    passages: (PassageRecord & { caseFileId: CaseFileId })[];
    pecas: (PecaDraft & { id: PecaId; caseFileId: CaseFileId })[];
    facts: (FactDraft & { caseFileId: CaseFileId })[];
  };
  answering: { questions: QuestionRecord[] };
  metering: {
    plans: Map<LawyerId, LawyerPlan>;
    charges: { lawyer: LawyerId; caseFileId: CaseFileId | null; pages: number; createdAt: Date }[];
    usage: (Usage & { lawyer: LawyerId; caseFileId: CaseFileId | null })[];
  };
};

/**
 * Keeps every repository's rows in memory. A run copies the state first and puts
 * the copy back if the work throws. Runs are not isolated from each other, so
 * concurrency (row locks) is tested only on Postgres.
 */
export class InMemoryUnitOfWork implements UnitOfWork {
  state: InMemoryState = {
    caseFiles: new Map(),
    ingestion: { ranges: [], pages: [], passages: [], pecas: [], facts: [] },
    answering: { questions: [] },
    metering: { plans: new Map(), charges: [], usage: [] },
  };
  private readonly inRun = new AsyncLocalStorage<true>();
  private readonly repos: Repositories = {
    caseFiles: new InMemoryCaseFileRepository(() => this.state),
    ingestion: new InMemoryIngestionRepository(() => this.state),
    answering: new InMemoryAnsweringRepository(() => this.state),
    metering: new InMemoryMeteringRepository(() => this.state),
  };

  async run<T>(work: (repos: Repositories) => Promise<T>): Promise<T> {
    if (this.inRun.getStore()) return work(this.repos);
    const before = structuredClone(this.state);
    try {
      return await this.inRun.run(true, () => work(this.repos));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}

class InMemoryCaseFileRepository implements CaseFileRepository {
  constructor(private readonly state: () => InMemoryState) {}

  async find(lawyer: LawyerId, id: CaseFileId) {
    const props = this.state().caseFiles.get(id);
    return props?.lawyer === lawyer ? CaseFile.restore(props) : null;
  }

  async findById(id: CaseFileId) {
    const props = this.state().caseFiles.get(id);
    return props ? CaseFile.restore(props) : null;
  }

  async listOf(lawyer: LawyerId) {
    return [...this.state().caseFiles.values()]
      .filter((props) => props.lawyer === lawyer)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((props) => CaseFile.restore(props));
  }

  async folhasOf(id: CaseFileId) {
    const folhas: Folhas = {};
    for (const page of this.state().ingestion.pages) {
      if (page.caseFileId === id && page.folha !== null) folhas[page.number] = page.folha;
    }
    return folhas;
  }

  async documentMapOf(id: CaseFileId): Promise<PecaView[]> {
    return this.state()
      .ingestion.pecas.filter((peca) => peca.caseFileId === id)
      .sort((a, b) => a.firstPage - b.firstPage)
      .map(({ caseFileId: _, ...peca }) => peca);
  }

  async save(caseFile: CaseFile) {
    this.state().caseFiles.set(caseFile.id, caseFile.snapshot());
  }
}

class InMemoryIngestionRepository implements IngestionRepository {
  constructor(private readonly state: () => InMemoryState) {}

  async addRanges(caseFileId: CaseFileId, ranges: PageRange[]) {
    for (const { first, last } of ranges) {
      if (this.range(caseFileId, first)) continue;
      this.state().ingestion.ranges.push({ caseFileId, first, last, status: "pending", attempts: 0 });
    }
  }

  async startRange(caseFileId: CaseFileId, range: PageRange) {
    const stored = this.range(caseFileId, range.first);
    if (!stored) return;
    stored.status = "running";
    stored.attempts += 1;
  }

  async finishRange(caseFileId: CaseFileId, range: PageRange) {
    const stored = this.range(caseFileId, range.first);
    if (stored) stored.status = "done";
  }

  async countUnfinishedRanges(caseFileId: CaseFileId) {
    return this.state().ingestion.ranges.filter((range) => range.caseFileId === caseFileId && range.status !== "done").length;
  }

  /** Like the foreign key on Postgres: the passages of a deleted page go with it. */
  async removePages(caseFileId: CaseFileId, { first, last }: PageRange) {
    const inRange = (row: { caseFileId: CaseFileId }, page: number) => row.caseFileId === caseFileId && page >= first && page <= last;
    const { ingestion } = this.state();
    ingestion.pages = ingestion.pages.filter((page) => !inRange(page, page.number));
    ingestion.passages = ingestion.passages.filter((passage) => !inRange(passage, passage.page));
  }

  async savePages(caseFileId: CaseFileId, pages: PageRecord[], passages: PassageRecord[]) {
    const { ingestion } = this.state();
    for (const page of pages) {
      if (ingestion.pages.some((stored) => stored.caseFileId === caseFileId && stored.number === page.number)) {
        throw new Error(`Page ${page.number} of case file ${caseFileId} is already stored.`);
      }
    }
    for (const passage of passages) {
      if (!pages.some((page) => page.number === passage.page)) throw new Error(`Page ${passage.page} is not among the pages saved.`);
    }
    ingestion.pages.push(...pages.map((page) => ({ ...page, caseFileId })));
    ingestion.passages.push(...passages.map((passage) => ({ ...passage, caseFileId })));
  }

  async countPages(caseFileId: CaseFileId) {
    return this.state().ingestion.pages.filter((page) => page.caseFileId === caseFileId).length;
  }

  async scannedPages(caseFileId: CaseFileId) {
    return this.state()
      .ingestion.pages.filter((page) => page.caseFileId === caseFileId && page.source === "scanned")
      .map((page) => page.number)
      .sort((a, b) => a - b);
  }

  async pageLengths(caseFileId: CaseFileId) {
    return this.pagesOf(caseFileId).map((page) => ({ page: page.number, chars: page.text.length }));
  }

  async pageTexts(caseFileId: CaseFileId, range: PageRange) {
    return this.pagesOf(caseFileId)
      .filter((page) => range.contains(page.number))
      .map((page) => ({ page: page.number, text: page.text, source: page.source }));
  }

  /** Like the foreign key on Postgres: a fact's page must be stored. */
  async replaceDocumentMap(caseFileId: CaseFileId, pecas: PecaDraft[], facts: FactDraft[]) {
    const { ingestion } = this.state();
    for (const fact of facts) {
      if (!ingestion.pages.some((page) => page.caseFileId === caseFileId && page.number === fact.page)) {
        throw new Error(`Page ${fact.page} of case file ${caseFileId} is not stored.`);
      }
    }
    ingestion.pecas = ingestion.pecas.filter((peca) => peca.caseFileId !== caseFileId);
    ingestion.facts = ingestion.facts.filter((fact) => fact.caseFileId !== caseFileId);
    ingestion.pecas.push(...pecas.map((peca) => ({ ...peca, id: PecaId(crypto.randomUUID()), caseFileId })));
    ingestion.facts.push(...facts.map((fact) => ({ ...fact, caseFileId })));
  }

  private pagesOf(caseFileId: CaseFileId) {
    return this.state()
      .ingestion.pages.filter((page) => page.caseFileId === caseFileId)
      .sort((a, b) => a.number - b.number);
  }

  private range(caseFileId: CaseFileId, first: number) {
    return this.state().ingestion.ranges.find((range) => range.caseFileId === caseFileId && range.first === first);
  }
}

/**
 * Search without Postgres: cosine distance stands in for the vector index, and the count
 * of the question's words in a passage stands in for Portuguese full-text search.
 */
class InMemoryAnsweringRepository implements AnsweringRepository {
  constructor(private readonly state: () => InMemoryState) {}

  async caseFileStatus(lawyer: LawyerId, caseFileId: CaseFileId) {
    const props = this.state().caseFiles.get(caseFileId);
    return props?.lawyer === lawyer ? props.status : null;
  }

  async search(caseFileId: CaseFileId, { text, embedding }: { text: string; embedding: number[] }, depth: number): Promise<RankedPassages> {
    const passages = this.state().ingestion.passages.filter((passage) => passage.caseFileId === caseFileId);
    const byVector = [...passages].sort((a, b) => this.cosine(b.embedding, embedding) - this.cosine(a.embedding, embedding)).slice(0, depth);
    const questionWords = new Set(this.words(text));
    const matches = (passage: { text: string }) => new Set(this.words(passage.text).filter((word) => questionWords.has(word))).size;
    const byText = passages.filter((passage) => matches(passage) > 0).sort((a, b) => matches(b) - matches(a)).slice(0, depth);
    return { byVector: byVector.map((passage) => this.found(passage)), byText: byText.map((passage) => this.found(passage)) };
  }

  async pecaPages(caseFileId: CaseFileId, pecaId: PecaId): Promise<PecaPage[] | null> {
    const { pecas, pages } = this.state().ingestion;
    const peca = pecas.find((candidate) => candidate.id === pecaId && candidate.caseFileId === caseFileId);
    if (!peca) return null;
    return pages
      .filter((page) => page.caseFileId === caseFileId && page.number >= peca.firstPage && page.number <= peca.lastPage)
      .sort((a, b) => a.number - b.number)
      .map(({ number, folha, source, text, blocks }) => ({ page: number, folha, source, text, boxes: blocks.map((block) => block.box) }));
  }

  async saveQuestion(question: QuestionRecord) {
    this.state().answering.questions.push(structuredClone(question));
  }

  private found({ caseFileId, page, text, blockIndexes }: InMemoryState["ingestion"]["passages"][number]): FoundPassage {
    const stored = this.state().ingestion.pages.find((record) => record.caseFileId === caseFileId && record.number === page);
    const boxes = blockIndexes.flatMap((index) => stored?.blocks[index]?.box ?? []);
    return { id: this.passageId(caseFileId, page, blockIndexes), page, folha: stored?.folha ?? null, text, boxes };
  }

  /** The fake stores no passage ids; a passage's case file, page and first block name it. */
  private passageId(caseFileId: CaseFileId, page: number, blockIndexes: number[]) {
    return `${caseFileId}:${page}:${blockIndexes[0] ?? 0}`;
  }

  /** Lowercase words of three letters or more, so most Portuguese articles and prepositions don't match. */
  private words(text: string) {
    return (text.toLowerCase().match(/\p{L}+/gu) ?? []).filter((word) => word.length >= 3);
  }

  private cosine(a: number[], b: number[]) {
    let dot = 0;
    let lengthA = 0;
    let lengthB = 0;
    a.forEach((value, i) => {
      dot += value * (b[i] ?? 0);
      lengthA += value * value;
      lengthB += (b[i] ?? 0) ** 2;
    });
    return dot / (Math.sqrt(lengthA * lengthB) || 1);
  }
}

class InMemoryMeteringRepository implements MeteringRepository {
  constructor(private readonly state: () => InMemoryState) {}

  async findPlan(lawyer: LawyerId) {
    return this.state().metering.plans.get(lawyer) ?? null;
  }

  /** Nothing runs at the same time in memory, so there is nothing to lock. */
  async lockPlan(lawyer: LawyerId) {
    return this.findPlan(lawyer);
  }

  async insertPlanIfMissing(lawyer: LawyerId, plan: LawyerPlan) {
    const { plans } = this.state().metering;
    if (!plans.has(lawyer)) plans.set(lawyer, { ...plan });
  }

  async pagesChargedSince(lawyer: LawyerId, since: Date) {
    return this.state()
      .metering.charges.filter((charge) => charge.lawyer === lawyer && charge.createdAt >= since)
      .reduce((pages, charge) => pages + charge.pages, 0);
  }

  async isCharged(caseFileId: CaseFileId) {
    return this.state().metering.charges.some((charge) => charge.caseFileId === caseFileId);
  }

  async insertCharge({ lawyer, caseFileId, pages }: QuotaCharge) {
    if (await this.isCharged(caseFileId)) return;
    this.state().metering.charges.push({ lawyer, caseFileId, pages, createdAt: new Date() });
  }

  async deleteCharge(caseFileId: CaseFileId) {
    const { metering } = this.state();
    metering.charges = metering.charges.filter((charge) => charge.caseFileId !== caseFileId);
  }

  async insertUsage(lawyer: LawyerId, caseFileId: CaseFileId | null, usage: Usage[]) {
    this.state().metering.usage.push(...usage.map((event) => ({ ...event, lawyer, caseFileId })));
  }
}
