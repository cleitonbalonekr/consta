import { PageRange, RANGE_ATTEMPTS } from "@consta/core";
import type { CaseFileId, RangeRunner } from "@consta/core";
import { INGEST_CASE_FILE_TASK } from "@consta/adapters";
import type { IngestCaseFilePayload } from "@consta/adapters";
import { task } from "@trigger.dev/sdk";
import { container } from "../container";

/** Ingests one page range. Ingestion.ingestRange is idempotent, so retries are safe. */
export const ingestRange = task({
  id: "ingest-range",
  machine: "medium-1x",
  retry: { maxAttempts: RANGE_ATTEMPTS },
  // The payload went through JSON, so the range is a plain object again.
  run: async (payload: IngestCaseFilePayload & { range: { first: number; last: number } }) => {
    const range = PageRange.from(payload.range.first, payload.range.last);
    await container().ingestion.ingestRange(payload.caseFileId, range);
  },
});

/** Runs each range as its own task, all in parallel, and returns the ranges whose task failed for good. */
const parallelRanges: RangeRunner = {
  async run(caseFileId: CaseFileId, ranges: PageRange[]) {
    const results = await ingestRange.batchTriggerAndWait(ranges.map((range) => ({ payload: { caseFileId, range } })));
    // The runs come back in the order of the items.
    return ranges.filter((_, i) => !results.runs[i]?.ok);
  },
};

/**
 * Ingests a case file, with its ranges in parallel. Ingestion retries its own steps and fails
 * the case file itself, so this task does not run again; onFailure covers a run that dies.
 */
export const ingestCaseFile = task({
  id: INGEST_CASE_FILE_TASK,
  retry: { maxAttempts: 1 },
  run: async ({ caseFileId }: IngestCaseFilePayload) => {
    await container().ingestion.ingest(caseFileId, parallelRanges);
  },
  onFailure: async ({ payload }) => {
    await container().ingestion.giveUp(payload.caseFileId);
  },
});
