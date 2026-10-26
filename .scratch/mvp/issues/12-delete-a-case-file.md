# 12: Delete a case file

**What to build:** A lawyer deletes a case file and everything derived from it disappears: pages, passages, peças, facts, questions and the stored PDF, including any unfinished upload. Usage records stay, without the case file, and the pages already charged are not returned to the page quota.

**Blocked by:** 04

**Status:** ready-for-human

- [x] `CaseFiles.remove` sets deleting, removes every derived row and the stored object, and aborts an open multipart upload
- [x] Usage records remain with the case file reference cleared; the quota charge stays
- [x] Removing another lawyer's case file throws `NotFound`
- [x] Integration tests assert that no derived row or object remains and that usage and quota charges survive
- [x] E2E covers deleting from the list with confirmation
- [x] Works locally in fake mode with Docker Compose

## Comments

**2026-10-26, implemented.** Same checks as ticket 11: typecheck, lint and tests pass, and all 28 E2E journeys pass with Docker Compose in fake mode, the delete journey included.

Decisions:

- **Order** (in `docs/architecture.md`):
  1. A run marks the case file deleting.
  2. After the commit, the open upload is aborted and the PDF removed.
  3. A second run deletes the row, and the foreign keys delete the ranges, pages, passages, peças, facts and questions.

  Usage records keep a null case file, and the quota charge has no foreign key, so it stays.
- **Retry:** if storage fails, the case file stays `deleting`, and calling `remove` again finishes the delete. `CaseFile.startDeleting` does nothing on a case file that is already deleting. `FileStore.abortMultipart` treats an upload that is already gone as no error: the contract covers this, and the S3 adapter ignores `NoSuchUpload`.
- **No delete while ingestion reads the file.** The lifecycle has no arrow from queued, processing or mapping to deleting, so `remove` throws `InvalidStatus` then. `CaseFileSummary.deletable` tells the web app, which hides the delete button.
- **Not done:** PRD F9 mentions a deletion log without file content and a storage purge within 24 hours. Neither is in this ticket's acceptance criteria, so neither was built.
