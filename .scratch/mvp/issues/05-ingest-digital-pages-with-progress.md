# 05: Ingest digital pages with progress

**What to build:** After an upload, ingestion reads every digital page: its text and block positions, split into passages that never cross a page break, each embedded for search. The lawyer watches "page N of M" advance and can close the tab. A page range that fails retries three times; after that the case file shows failed with a reason the lawyer can read. In production the ranges run in parallel as Trigger.dev tasks; locally, both adapter modes use `pnpm dev:jobs` (`trigger dev`) against the Trigger.dev dev environment (ADR-0009). The E2E server has no Trigger.dev key, so it runs ingestion in-process with the inline `Jobs` adapter: `CONSTA_JOBS=inline` replaces `recording`. Until ticket 09, the map step marks the case file ready with an empty document map. This is the Phase 1 gate in `prd-mvp.md`.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] `Ingestion.plan`, `ingestRange` and `map` (ready with an empty document map) are implemented; a retried range replaces its own pages and passages only
- [ ] Text and block positions come from pdf.js; passages never cross a page break and keep their block indexes
- [ ] `page` gets the primary key `(case_file_id, number)`; `passage (case_file_id, page)` references it with on delete cascade, so a retried range deletes its pages and their passages go with them
- [ ] `ingestion_range` has `CHECK (first_page <= last_page)`
- [ ] `Ingestion.fail` gives the case file's pages back by deleting its `quota_charge` row, so a failed ingestion doesn't use quota
- [ ] The Voyage embedder adapter is implemented with a contract test; fake mode uses the fake embedder
- [ ] The Trigger.dev tasks plan, fan out ranges, and call `fail` when any range fails after retries
- [ ] Progress in the UI comes from the database and updates while the lawyer watches
- [ ] Every embedding call records usage through Metering
- [ ] Integration tests use fixture PDFs (digital, two-column) through the inline `Jobs` adapter, and cover a range retry leaving no orphan passages and `fail` returning the pages
- [ ] E2E covers upload to ready with visible progress, in fake mode
- [ ] An extraction check script in `packages/evals` writes a report of 20 random pages beside their PDF images for a manual check, plus time and cost per 1,000 pages
- [ ] If the two-column fixture reads out of order, record the outcome and the extractor decision (ADR-0004)
- [ ] Works locally in both modes
