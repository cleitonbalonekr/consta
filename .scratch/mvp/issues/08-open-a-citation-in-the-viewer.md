# 08: Open a citation in the viewer

**What to build:** Clicking a citation opens the real case file at the cited page, with the cited text marked from its boxes. The viewer reads the PDF from object storage through a signed URL and loads only the pages it shows, using HTTP range requests. The lawyer can move between pages and sees the folha beside the page number when there is one. Locally the PDF comes from MinIO.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] `CaseFiles.readUrl` returns a signed, range-readable URL; the viewer loads pages on demand rather than the whole file
- [ ] The cited page opens with every box of the citation marked
- [ ] Page navigation works; the folha appears beside the page number when present
- [ ] Component tests cover placing marks from box fractions at different zoom levels
- [ ] E2E covers clicking a citation and seeing the right page with a visible mark
- [ ] Works locally with MinIO
