# 05: Ingest digital pages with progress

**What to build:** After an upload, ingestion classifies every page as digital or scanned and reads every digital page: its text and block positions, split into passages that never cross a page break, each embedded for search. The lawyer watches "page N of M" advance and can close the tab. A page range that fails retries three times; after that the case file shows failed with a reason the lawyer can read. In production the ranges run in parallel as Trigger.dev tasks; locally, both adapter modes use `pnpm dev:jobs` (`trigger dev`) against the Trigger.dev dev environment (ADR-0009). The E2E server has no Trigger.dev key, so it runs ingestion in-process with the inline `Jobs` adapter: `CONSTA_JOBS=inline` replaces `recording`. Scanned pages are not read in the MVP (ADR-0010): they are stored with no text and no passages, and the lawyer sees which pages were not read. Ingestion also detects the court-stamped folha on every digital page. Until ticket 09, the map step marks the case file ready with an empty document map. This is the Phase 1 gate in `prd-mvp.md`.

**Blocked by:** 04

**Status:** ready-for-human

- [x] `Ingestion.plan`, `ingestRange` and `map` (ready with an empty document map) are implemented; a retried range replaces its own pages and passages only
- [x] Text and block positions come from pdf.js; passages never cross a page break and keep their block indexes
- [x] Page classification marks a page without usable text as `scanned`; it is stored with no text and gets no passages (ADR-0010)
- [x] The case file page shows the lawyer which pages are scanned and were not read
- [x] Folha detection reads the "fls." stamp where present and leaves it empty otherwise
- [x] Unit tests cover the classifier and the folha parser with real-looking samples
- [x] `page` gets the primary key `(case_file_id, number)`; `passage (case_file_id, page)` references it with on delete cascade, so a retried range deletes its pages and their passages go with them
- [x] `ingestion_range` has `CHECK (first_page <= last_page)`
- [x] `Ingestion.fail` gives the case file's pages back by deleting its `quota_charge` row, so a failed ingestion doesn't use quota
- [x] The Voyage embedder adapter is implemented with a contract test; fake mode uses the fake embedder
- [x] The Trigger.dev tasks plan, fan out ranges, and call `fail` when any range fails after retries
- [x] Progress in the UI comes from the database and updates while the lawyer watches
- [x] Every embedding call records usage through Metering
- [x] Integration tests use fixture PDFs (digital, two-column, scanned) through the inline `Jobs` adapter, and cover a range retry leaving no orphan passages `fail` returning the pages, and scanned pages stored with no passages
- [x] E2E covers upload to ready with visible progress, in fake mode
- [x] An extraction check script in `packages/evals` writes a report of 20 random pages beside their PDF images for a manual check, plus time and cost per 1,000 pages
- [x] If the two-column fixture reads out of order, record the outcome and the extractor decision (ADR-0004)
- [ ] Works locally in both modes

## Comments

**2026-10-17, implemented; two checks need a person.** `pnpm typecheck`, `pnpm lint` and `pnpm test` pass (core 211, adapters 16 with 3 skipped, web 35). E2E: 10 journeys pass and 7 are `test.fixme()` (`CI=1 pnpm test:e2e`, with `docker compose up -d`). The upload journeys passed 15 of 15 runs with `--repeat-each=3`.

Not verified, so "Works locally in both modes" stays open:

- `pnpm dev` with `pnpm dev:jobs` against the Trigger.dev dev environment was not run: it needs a Trigger.dev login. The tasks typecheck and lint.
- The Voyage contract test (`packages/adapters/src/voyage/voyage.integration.test.ts`) was not run: it needs `VOYAGE_API_KEY` and costs money. It is skipped without the key. The adapter's unit test uses a stubbed `fetch`.
- The extraction check ran only on the sample PDF. It must run on real case files before the Phase 1 gate closes.

Decisions:

- **Status changes go through `CaseFileLifecycle`**, a second class exported from Case files. It takes only `uow`, finds the case file by id without a lawyer (`CaseFileRepository.findById`), locks the row and calls the `CaseFile` methods. Thus no other code sets a status, and the jobs runtime does not have to build `CaseFiles` with a `Jobs` adapter. Each method does nothing when the status is already its target, so every step can be retried.
- **Progress**: after every batch of 10 pages (`PAGES_PER_BATCH`), one embedding call, then one run that saves the pages and passages and sets `pages_done` to the count of stored pages. `CaseFile.recordPagesRead` only goes up, because ranges run in parallel and a retry reads its pages again.
- **Retries**: a range has 4 attempts (`RANGE_ATTEMPTS`): it "retries three times". The `ingest-range` task uses this value. The parent task calls `fail` when ranges fail, and `onFailure` calls `fail` when the parent itself fails for good.
- **Failure reasons are Portuguese** and come from `Ingestion` (`unreadRangesReason`, `unreadableFileReason`), for example "Não conseguimos ler as páginas 101 a 200."
- **Unread pages** are stored on the case file as ranges (`case_file.unread_pages`, jsonb) when it becomes ready, so `CaseFiles.view` does not read Ingestion's tables. The case file page shows them in a notice (`UnreadPages`).
- **Blocks are lines.** pdf.js text items are joined into a line, and a wide horizontal gap starts a new block, so the two columns of one line never join. The box follows the text direction, so the rotated e-SAJ margin gets a vertical box.
- **Classification**: a page is `scanned` when it has fewer than 20 letters after the court stamps are removed (folha stamp, e-SAJ margin signature, PJe footer). These stamps are text on scanned pages too.
- **Folha**: only a block that is the stamp alone ("fls. 123", "Fls.: 1.234", "fls. 45v"), so "conforme fls. 45" in a sentence is not a folha. The top stamp wins. The folha is read on scanned pages too.
- **Two-column pages**: the fixture reads in order. A PDF that draws rows across both columns reads out of order. The outcome and the decision are in ADR-0004.
- **`InlineJobs` returns at once** and runs ingestion in the background, as a queue does; tests wait with `idle()`. `CONSTA_JOBS=inline` replaces `recording`; `RecordingJobs` stays for tests that run the steps themselves.
- **`Metering.record`** is implemented (one `usage_event` row per provider call) and is called after each embedding call, outside the run that saves the passages. `Metering.givePagesBack` deletes the case file's `quota_charge` row.
- **Changed in passing**: `CaseFiles.readUrl` is implemented (signed URL, one hour), because the ready page calls it. Ticket 08 still owns the viewer. `StoredPdf` in `shared` opens a stored PDF for both the page counter and the reader. `Ingestion` deps no longer take `extractor` and `mailer` (tickets 09 and 13 add them).
- **Extraction check**: `pnpm --filter @consta/evals extraction-check <case-file.pdf> [out-dir]` writes `report.html` and `pages.pdf` (the 20 sampled pages) into `packages/evals/out/`. With `VOYAGE_API_KEY` it embeds with Voyage and reports the real cost.

