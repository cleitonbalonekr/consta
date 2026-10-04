import type { CaseFileStatus } from "@consta/core";

/** How long each simulated ingestion step takes, so a demo upload is ready in about four seconds. */
const INGESTION_TIMING = { queuedMs: 600, processingMs: 2400, mappingMs: 700 };

export type SimulatedIngestion = {
  pageCount: number;
  /** When finishUpload ran, or null while the upload is open. */
  finishedAt: number | null;
  /** The page whose reading fails, for a case file scripted to fail. */
  failsAtPage: number | null;
};

export type Progress = { status: CaseFileStatus; pagesDone: number; error: string | null };

/** Where a simulated ingestion is at `now`: queued, then pages read one by one, then mapping, then ready. */
export function ingestionProgress(ingestion: SimulatedIngestion, now: number): Progress {
  if (ingestion.finishedAt === null) return { status: "uploading", pagesDone: 0, error: null };

  const { queuedMs, processingMs, mappingMs } = INGESTION_TIMING;
  const elapsed = now - ingestion.finishedAt;
  if (elapsed < queuedMs) return { status: "queued", pagesDone: 0, error: null };

  const pagesRead = Math.min(ingestion.pageCount, Math.floor((ingestion.pageCount * (elapsed - queuedMs)) / processingMs));
  if (ingestion.failsAtPage !== null && pagesRead >= ingestion.failsAtPage) {
    return {
      status: "failed",
      pagesDone: ingestion.failsAtPage - 1,
      error: `Não foi possível ler a página ${ingestion.failsAtPage}, mesmo depois de três tentativas.`,
    };
  }
  if (elapsed < queuedMs + processingMs) return { status: "processing", pagesDone: pagesRead, error: null };
  if (elapsed < queuedMs + processingMs + mappingMs) return { status: "mapping", pagesDone: ingestion.pageCount, error: null };
  return { status: "ready", pagesDone: ingestion.pageCount, error: null };
}
