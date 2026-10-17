import type { Metering } from "../metering";
import type { Embedder, FileStore, Mailer, MapExtractor, UnitOfWork } from "../ports";
import { NotImplemented } from "../shared";
import type { CaseFileId, PageRange } from "../shared";

/** Pages per range. One task ingests one range. */
export const PAGES_PER_RANGE = 100;

/**
 * Turns an uploaded case file into pages, passages, a document map and facts.
 *
 * Call order: `plan`, then `ingestRange` for every range (in parallel), then `map`.
 * Every step is idempotent, so a runner may retry any of them.
 */
export interface Ingestion {
  /** Splits the case file into page ranges and records them. */
  plan(caseFileId: CaseFileId): Promise<PageRange[]>;
  /** Reads, splits and embeds the digital pages of one range. A retry replaces that range's pages and passages. */
  ingestRange(caseFileId: CaseFileId, range: PageRange): Promise<void>;
  /** Builds the document map and facts, marks the case file ready and emails the lawyer. */
  map(caseFileId: CaseFileId): Promise<void>;
  /** Marks the case file failed with a reason the lawyer can read, and emails them. */
  fail(caseFileId: CaseFileId, reason: string): Promise<void>;
}

export type IngestionDeps = {
  uow: UnitOfWork;
  files: FileStore;
  embedder: Embedder;
  extractor: MapExtractor;
  mailer: Mailer;
  metering: Metering;
};

export function createIngestion(_deps: IngestionDeps): Ingestion {
  const todo = (method: string) => async (): Promise<never> => {
    throw new NotImplemented(`Ingestion.${method}`);
  };
  return {
    plan: todo("plan"),
    ingestRange: todo("ingestRange"),
    map: todo("map"),
    fail: todo("fail"),
  };
}

/**
 * Runs every step in order, in-process. Used by the inline `Jobs` adapter in
 * tests and local runs; the Trigger.dev tasks run the ranges in parallel instead.
 */
export async function ingestInline(ingestion: Ingestion, caseFileId: CaseFileId) {
  try {
    const ranges = await ingestion.plan(caseFileId);
    for (const range of ranges) await ingestion.ingestRange(caseFileId, range);
    await ingestion.map(caseFileId);
  } catch (error) {
    await ingestion.fail(caseFileId, error instanceof Error ? error.message : String(error));
    throw error;
  }
}
