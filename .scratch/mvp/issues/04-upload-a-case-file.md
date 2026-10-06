# 04: Upload a case file

**What to build:** A signed-in lawyer uploads a real PDF of up to 500 MB and 5,000 pages. The browser reads the page count first, so a case file over the page quota is refused before any bytes move. Parts go straight from the browser to object storage, and an interrupted upload resumes where it stopped. Finishing the upload recounts the pages, re-checks and charges the quota, sets the case file to queued and asks `Jobs` to start ingestion. The real `CaseFiles` replaces the demo version for upload, list and view; the demo `Answering` stays. Locally, object storage is MinIO from Docker Compose.

**Blocked by:** 02, 17

**Status:** ready-for-agent

- [ ] `CaseFiles.startUpload`, `signUploadPart`, `uploadedParts`, `finishUpload`, `view` and `list` are implemented, with ownership checks returning `NotFound`
- [ ] The S3 file store adapter is implemented and passes the `FileStore` contract test against MinIO and against the in-memory fake
- [ ] Docker Compose runs MinIO with the bucket created and CORS that exposes `ETag`; `.env.example` points the S3 settings at it
- [ ] Quota: `QuotaExceeded` before the upload starts; the recount at finish re-checks; `Metering.chargePages` charges once per case file
- [ ] `Metering.chargePages` checks and charges in one transaction: it locks the lawyer's `lawyer_plan` row (`SELECT … FOR UPDATE`), sums the month's charges, inserts the charge and throws `QuotaExceeded` when it doesn't fit. `finishUpload` doesn't call `pagesLeft` separately
- [ ] A unique index on `quota_charge.case_file_id` makes the charge idempotent in the database (`ON CONFLICT DO NOTHING`)
- [ ] `finishUpload` is idempotent; until ticket 05, the local `Jobs` adapter records the start request without running ingestion
- [ ] Integration tests cover quota refusal, the recount, idempotent finish, ownership, and two concurrent finishes that together exceed the quota (only one is charged)
- [ ] E2E journeys cover uploading a fixture PDF to queued, and resuming an upload after the network drops (Docker Compose running)
- [ ] Works locally in fake mode with Docker Compose and no accounts
