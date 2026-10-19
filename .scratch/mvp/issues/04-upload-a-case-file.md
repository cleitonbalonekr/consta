# 04: Upload a case file

**What to build:** A signed-in lawyer uploads a real PDF of up to 500 MB and 5,000 pages. The browser reads the page count first, so a case file over the page quota is refused before any bytes move. Parts go straight from the browser to object storage, and an interrupted upload resumes where it stopped. Finishing the upload recounts the pages, re-checks and charges the quota, sets the case file to queued and asks `Jobs` to start ingestion. The real `CaseFiles` replaces the demo version for upload, list and view; the demo `Answering` stays. Locally, object storage is MinIO from Docker Compose.

**Blocked by:** 02, 17

**Status:** done

- [x] `CaseFiles.startUpload`, `signUploadPart`, `uploadedParts`, `finishUpload`, `view` and `list` are implemented, with ownership checks returning `NotFound`
- [x] The S3 file store adapter is implemented and passes the `FileStore` contract test against MinIO and against the in-memory fake
- [x] Docker Compose runs MinIO with the bucket created and CORS that exposes `ETag`; `.env.example` points the S3 settings at it
- [x] Quota: `QuotaExceeded` before the upload starts; the recount at finish re-checks; `Metering.chargePages` charges once per case file
- [x] `Metering.chargePages` checks and charges in one transaction: it locks the lawyer's `lawyer_plan` row (`SELECT … FOR UPDATE`), sums the month's charges, inserts the charge and throws `QuotaExceeded` when it doesn't fit. `finishUpload` doesn't call `pagesLeft` separately
- [x] A unique index on `quota_charge.case_file_id` makes the charge idempotent in the database (`ON CONFLICT DO NOTHING`)
- [x] `finishUpload` is idempotent; until ticket 05, the local `Jobs` adapter records the start request without running ingestion
- [x] A `CaseFile` entity class in the Case files module owns the status lifecycle in `docs/architecture.md` (ADR-0007). Its methods change the status and throw `InvalidStatus` for a transition that the diagram does not show. No other code sets a status
- [x] The Case files repository loads and saves `CaseFile` instances. `finishUpload` loads the case file, calls its method for `queued`, and saves it
- [x] `finishUpload` makes no external call inside `uow.run`. The `FileStore` calls (close the upload, recount the pages) occur before the run. The charge and the change to `queued` occur in one run. `Jobs` starts ingestion only after the run commits
- [x] When `Jobs` fails after the commit, the case file stays `queued` and a new `finishUpload` starts ingestion again. The Trigger.dev adapter uses the case file id as the idempotency key, so ingestion starts only once
- [x] Value objects with a static `from` that validates: `PageRange` and the page count of an upload (1 or more, not more than 5,000). They throw a `DomainError` subclass for invalid input
- [x] `CaseFiles` and `Metering` are classes that get their dependencies in their constructors. `createCaseFiles` and `createMetering` are removed, and both composition roots and the demo container use the classes
- [x] The `apps/web` lint rule that blocks module construction outside `container.ts` blocks the class names, and it permits type imports (`@typescript-eslint/no-restricted-imports` with `allowTypeImports`)
- [x] Integration tests cover quota refusal, the recount, idempotent finish, ownership, and two concurrent finishes that together exceed the quota (only one is charged)
- [x] Unit tests cover each valid and each invalid status transition of `CaseFile`, the validation of each value object, and a `Jobs` fake that throws after the commit (the charge stays, the status is `queued`, and a retry starts ingestion)
- [x] E2E journeys cover uploading a fixture PDF to queued, and resuming an upload after the network drops (Docker Compose running)
- [x] Works locally in fake mode with Docker Compose and no accounts

## Comments

**2026-10-10, done.** `pnpm typecheck` and `pnpm test` pass (178 tests). `pnpm lint` passes in each package. Only the untracked `apps/jobs/src/trigger/example.ts` fails (`no-explicit-any`), and this file is not part of this ticket. E2E: 8 journeys pass and 7 are `test.fixme()` (`CI=1 pnpm test:e2e`, with `docker compose up -d`).

- Decided with the user: the demo mode is removed (ADR-0008). The app always uses the real modules. Local runs and E2E use Postgres and MinIO from Docker Compose, with fake adapters for the paid services. Thus the criterion "the demo container uses the classes" does not apply: the demo container does not exist. The demo `Answering` also does not exist. The real `Answering` stays a stub until ticket 07.
- Decided with the user: E2E runs in the one Playwright project. The CI workflow does not start Postgres and MinIO yet. Until it does, the E2E job and the S3 contract test fail in CI.
- Journeys that need a state the app cannot make yet are `test.fixme()`: ask and the tablet layout (need a ready case file: tickets 05 and 07), and delete (ticket 12). The upload journeys for progress to ready and for a failed ingestion are removed. Ticket 05 adds them again.
- MinIO no longer publishes its images on Docker Hub or quay.io. `docker-compose.yml` uses `bitnamilegacy/minio:2025.7.23`. This image makes the `consta` bucket on start. Its CORS settings permit ports 3000 and 3100 and expose `ETag`.
- In fake mode, `S3_*` settings that are empty fall back to the MinIO of `docker-compose.yml`. `.env.example` also points at it.
- The `FileStore` port changed: `completeMultipart(key, uploadId)` lists the parts itself and returns `{ bytes }`. A second call on a completed upload returns the same size. Thus a retry of `finishUpload` works after the upload closed (for example after `QuotaExceeded` at the recount).
- The page recount uses pdf.js in `packages/core` (`PdfPageCounter`). It reads the stored PDF through `FileStore.read` in 1 MB ranges, so it does not load a 500 MB file at once. `apps/web/next.config.ts` keeps `pdfjs-dist` out of the server bundle (`serverExternalPackages`). Without it, the recount fails in the production build.
- `finishUpload` order: close the upload and recount (outside the run), then in one run lock the case file row, `Metering.chargePages` (locks the `lawyer_plan` row) and `CaseFile.queue`, then `Jobs.startIngestion` after the commit. A finish on a `queued` case file asks `Jobs` again.
- PGlite runs one transaction at a time, so the concurrent-finish integration test shows the result but not the lock. A temporary test on the Docker Postgres showed the lock: with `FOR UPDATE`, one of two concurrent 300-page charges on a 500-page quota is refused. Without it, both are charged.
- Value objects: `PageRange` (in `shared`), and `PageCount` (1 to 5,000) and `FileSize` (1 byte to 500 MB) in Case files. They throw `InvalidPageRange`, `InvalidPageCount` and `InvalidFileSize`. The server actions show the last two to the lawyer.
- Resume: no Uppy. When a part fails, the upload component keeps the file and shows "Continuar envio". This button asks `uploadedParts` and sends only the parts that are not stored. The resume works in the same page. After a reload, the lawyer must start a new upload.
- Changed in passing (ADR-0007, code that this ticket touched): `DrizzleUnitOfWork`, the Drizzle repositories, `S3FileStore` and `TriggerJobs` are classes. `RecordingJobs` is the new `Jobs` fake for fake mode. `InlineJobs` stays for ticket 05.
- `CaseFiles.readUrl` and `remove` still throw `NotImplemented` (tickets 08 and 12). The delete button shows its error message.
