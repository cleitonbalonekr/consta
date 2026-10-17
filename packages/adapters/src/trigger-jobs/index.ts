import type { CaseFileId } from "@consta/core";
import type { Jobs } from "@consta/core/ports";
import { tasks } from "@trigger.dev/sdk";

/** The task id defined in apps/jobs/src/trigger/ingest-case-file.ts. */
export const INGEST_CASE_FILE_TASK = "ingest-case-file";

export type IngestCaseFilePayload = { caseFileId: CaseFileId };

/** Queues ingestion on Trigger.dev. Needs TRIGGER_SECRET_KEY in the environment. */
export class TriggerJobs implements Jobs {
  /** The case file id is the idempotency key, so a retried finishUpload starts ingestion only once. */
  async startIngestion(caseFileId: CaseFileId) {
    const payload: IngestCaseFilePayload = { caseFileId };
    await tasks.trigger(INGEST_CASE_FILE_TASK, payload, { idempotencyKey: `ingest-${caseFileId}` });
  }
}
