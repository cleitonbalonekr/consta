import type { CaseFileId } from "../../shared";
import type { Jobs } from "../jobs";

/**
 * Runs the work in-process instead of queueing it. The runner is passed lazily
 * because Ingestion is usually built after the module that starts it.
 */
export class InlineJobs implements Jobs {
  constructor(private readonly runIngestion: () => (caseFileId: CaseFileId) => Promise<void>) {}

  async startIngestion(caseFileId: CaseFileId) {
    await this.runIngestion()(caseFileId);
  }
}
