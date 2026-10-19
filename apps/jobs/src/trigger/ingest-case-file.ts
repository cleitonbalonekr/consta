import { Ingestion, PageRange, RANGE_ATTEMPTS } from "@consta/core";
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

/**
 * Plans the ranges, ingests them in parallel, then marks the case file ready. A range
 * that fails on every attempt fails the case file; so does this task when it fails for good.
 */
export const ingestCaseFile = task({
  id: INGEST_CASE_FILE_TASK,
  retry: { maxAttempts: 2 },
  run: async ({ caseFileId }: IngestCaseFilePayload) => {
    const { ingestion } = container();
    const ranges = await ingestion.plan(caseFileId);

    const results = await ingestRange.batchTriggerAndWait(ranges.map((range) => ({ payload: { caseFileId, range } })));
    // The runs come back in the order of the items.
    const failed = ranges.filter((_, i) => !results.runs[i]?.ok);
    if (failed.length > 0) {
      await ingestion.fail(caseFileId, Ingestion.unreadRangesReason(failed));
      return;
    }

    await ingestion.map(caseFileId);
  },
  onFailure: async ({ payload }) => {
    await container().ingestion.fail(payload.caseFileId, Ingestion.unreadableFileReason);
  },
});
