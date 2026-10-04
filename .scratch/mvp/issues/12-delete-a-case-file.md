# 12: Delete a case file

**What to build:** A lawyer deletes a case file and everything derived from it disappears: pages, passages, peças, facts, questions and the stored PDF, including any unfinished upload. Usage records stay, without the case file, and the pages already charged are not returned to the page quota.

**Blocked by:** 04

**Status:** ready-for-agent

- [ ] `CaseFiles.remove` sets deleting, removes every derived row and the stored object, and aborts an open multipart upload
- [ ] Usage records remain with the case file reference cleared; the quota charge stays
- [ ] Removing another lawyer's case file throws `NotFound`
- [ ] Integration tests assert that no derived row or object remains and that usage and quota charges survive
- [ ] E2E covers deleting from the list with confirmation
- [ ] Works locally in fake mode with Docker Compose
