import type { CaseFileId } from "../shared";

/** Starts background work. Returns as soon as the work is queued. */
export interface Jobs {
  startIngestion(caseFileId: CaseFileId): Promise<void>;
}
