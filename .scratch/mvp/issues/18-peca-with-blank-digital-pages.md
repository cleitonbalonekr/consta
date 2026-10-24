# 18: Refuse a peça whose digital pages have no text, and tell the lawyer when a PDF has no text

**What to build:** A peça is refused as `not-readable` when none of its digital pages has a block, the same as a peça whose pages are all scanned. Today `pecaPages` (`packages/core/src/answering/index.ts`) only checks that some page is digital, while `pecaReading` keeps only digital pages that have blocks. A peça whose one digital page has an empty text layer passes the check, gives zero passages, skips the model, and saves an empty answer as done.

Also, when ingestion finds no text in the whole PDF (every page is scanned: images with no OCR text layer), the case file page tells the lawyer that Consta can't read this PDF yet and that reading scanned pages will come in a future version (ADR-0010). Today such a file ends as ready, and the page only shows the usual banner that lists every page as an unread scanned page, so the lawyer can't tell that the whole file has no text. A file with at least one digital page keeps the usual banner and no new notice. A scan that already has an OCR text layer is a digital page (`PageClassifier`), so it never triggers the notice.

Proposed copy, to adjust in review: "Este PDF não tem texto: as páginas são imagens digitalizadas sem OCR. O Consta ainda não lê PDFs assim; a leitura de páginas digitalizadas estará disponível em uma próxima versão."

**Blocked by:** none

**Status:** needs-triage

- [x] A peça with digital pages but no blocks is refused as `not-readable`, and no question is saved
- [x] A peça with at least one digital page that has a block is answered as today
- [x] Unit test through `Answering`, integration test on PGlite
- [x] A ready case file whose every page is scanned shows the no-text notice in place of the unread-pages banner
- [x] A case file with at least one digital page shows no such notice; its scanned pages are listed as today
- [x] Component test of the notice; E2E uploads a PDF of scanned pages only (`pdfWithText(2, [1, 2])`) and sees the notice

## Comments

**2026-10-23:** found by the code review of `feat/operator-cost-page-and-billing`. The bug comes from earlier commits (`7c22fee`, `f972647`), not that branch.

**2026-10-24:** added the no-text notice to the scope. A lawyer uploaded a scanned case file and it worked only because the scans already had an OCR text layer; a file without one would have looked broken. The notice shows only when no page has text, never for a file that mixes digital and scanned pages. Questions for triage:

- Does the no-text case file keep the question box and the document map, or does the notice replace the workspace? Every answer would cite nothing.
- Should the file's pages still count against the page quota, or be given back (`givePagesBack`)? The lawyer gets nothing from them.
- Does ingestion still call the map model on pages with no text? If so, it can stop early when no page is digital and save that cost.

**2026-10-24, implemented (not committed yet).** `pnpm typecheck`, `pnpm lint`, `pnpm test` and the E2E suite pass.

- **One rule for a citable page.** `isCitable` in `packages/core/src/answering/index.ts` (a digital page with a block) decides both the `not-readable` refusal and the pages `pecaReading` reads, so the two can't disagree again. Through ingestion a digital page always has blocks (`PageClassifier` needs 20 letters), so the tests empty a stored page's blocks, as the budget test edits a stored page's text.
- **`CaseFile.allPagesScanned`** and **`unreadPageCount`**, on `CaseFileView`: the unread pages cover every page, and how many pages they cover. False and 0 until ready. The count lives on the entity, so the web app no longer adds up the ranges.
- **The notice** is `NoTextNotice` (`#no-text`), with the proposed copy. The case file page shows it in place of `UnreadPages` when `allPagesScanned`.

Answers to the triage questions, taking the smallest scope; each can be its own ticket:

- **The workspace stays**: the document map and the question box still show. A question about the whole file finds no passages and gives an empty answer; a peça question is refused as `not-readable`.
- **The page quota is unchanged**: the pages still count.
- **The map model is still called once**: with no text, `PageWindows.plan` makes one window of empty pages, so ingestion makes one map call that reads only the prompt. Skipping it when no page is digital saves that call.
