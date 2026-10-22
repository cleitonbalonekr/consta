# 08: Open a citation in the viewer

**What to build:** Clicking a citation opens the real case file at the cited page, with the cited text marked from its boxes. The viewer reads the PDF from object storage through a signed URL and loads only the pages it shows, using HTTP range requests. The lawyer can move between pages and sees the folha beside the page number when there is one. Locally the PDF comes from MinIO.

**Blocked by:** 07

**Status:** ready-for-human

- [x] `CaseFiles.readUrl` returns a signed, range-readable URL; the viewer loads pages on demand rather than the whole file
- [x] The cited page opens with every box of the citation marked
- [x] Page navigation works; the folha appears beside the page number when present
- [x] Component tests cover placing marks from box fractions at different zoom levels
- [x] E2E covers clicking a citation and seeing the right page with a visible mark
- [x] Works locally with MinIO

## Comments

**2026-10-22, implemented; one production setting needs a person.** `pnpm typecheck`, `pnpm lint` and `pnpm test` pass (core 258, adapters 30 with 9 skipped, web 46). E2E: 13 journeys pass and 6 are `test.fixme()` (`CI=1 pnpm test:e2e`, with `docker compose up -d`). The large-PDF journey was checked red without the pdf.js flags: the viewer then streamed the whole file and made no range read.

Needs a person: the production R2 bucket's CORS rule must allow `GET` from our domain and expose `Accept-Ranges`, `Content-Range` and `Content-Length`. Without them pdf.js can't see that ranges work, and it downloads the whole case file. MinIO exposes these headers by default; `s3-file-store.integration.test.ts` checks them for `localhost:3100`.

Decisions:

- **pdf.js reads ranges only** (`disableAutoFetch`, `disableStream` in `lib/pdf.ts`). Without them, pdf.js keeps fetching the rest of the file in the background after the first page.
- **The folha of every page comes with the case file view** (`CaseFileView.folhas`, page → folha, read by `CaseFileRepository.folhasOf` once the case file is ready). The viewer shows it beside the page number on any page, not only the cited one. It is about 75 KB for 5,000 pages. The repository reads Ingestion's `page` table, as `AnsweringRepository` already does.
- **Zoom has five steps** (100% to 300% of the width that fits the viewer). Marks are percentages of the page, so they follow every zoom. The component tests check their fractions at several zooms; jsdom has no layout, so the E2E checks that the marks lie on the rendered page.
- **A page that fails to read shows an error** asking the lawyer to reload. Pages load only when shown, so a read can fail after the one-hour signed URL expires; reloading the page signs a new one.
- **`FileStore` contract: a read URL serves a byte range with 206.** The in-memory fake gets a `readRange` test helper, like `putPart`.

**2026-10-22, R2 CORS policy added.** The production bucket now allows `GET` and `PUT` from the production domain, with `Range` and `Content-Type` allowed, and exposes `Accept-Ranges`, `Content-Range` and `Content-Length`. Still to check after this branch is deployed: a citation in production reads the PDF in `206` ranges, not one `200` download.

