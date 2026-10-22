import type { CaseFileId } from "../../shared";
import type { Jobs } from "../jobs";

/**
 * Runs the work in-process instead of queueing it, and returns before the work ends,
 * as a queue would. The E2E server uses it (CONSTA_JOBS=inline) and so do tests,
 * which wait with `idle`. The runner is passed lazily because Ingestion is usually
 * built after the module that starts it. A second start of a running case file does nothing.
 */
export class InlineJobs implements Jobs {
  private readonly running = new Map<CaseFileId, Promise<void>>();

  constructor(
    private readonly runIngestion: () => (caseFileId: CaseFileId) => Promise<void>,
    /** Where a failed run is reported. The runner already marked the case file failed. */
    private readonly onError: (caseFileId: CaseFileId, error: unknown) => void = () => {},
  ) {}

  async startIngestion(caseFileId: CaseFileId) {
    if (this.running.has(caseFileId)) return;
    const run = this.runIngestion()(caseFileId)
      .catch((error: unknown) => this.onError(caseFileId, error))
      .finally(() => this.running.delete(caseFileId));
    this.running.set(caseFileId, run);
  }

  /** Waits until every started run has ended. */
  async idle() {
    while (this.running.size > 0) await Promise.all(this.running.values());
  }
}

/** Records each request to start ingestion and runs nothing, for tests that run the ingestion steps themselves. */
export class RecordingJobs implements Jobs {
  readonly started: CaseFileId[] = [];

  async startIngestion(caseFileId: CaseFileId) {
    this.started.push(caseFileId);
  }
}
