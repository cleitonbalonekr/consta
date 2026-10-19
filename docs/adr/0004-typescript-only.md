# TypeScript only, with Python allowed only inside ingestion's text extraction

The whole system is TypeScript and uses pdf.js and pdf-lib for PDF work, although Python has the stronger PDF and retrieval ecosystem. One language keeps one toolchain and one deploy, and PyMuPDF's AGPL-3.0 licence is a risk for a closed-source SaaS. If pdf.js mixes up two-column pages in the Phase 1 test, a Python extractor (pypdfium2 or Docling) runs as a Trigger.dev task inside Ingestion, and nothing outside Ingestion changes.

## Phase 1 outcome: two-column pages (ticket 05)

pdf.js gives text in the order the PDF draws it, and Ingestion does not reorder it. Ingestion starts a new block at a wide horizontal gap, so the two columns of one line never join into one block, and each block keeps its own box.

- **Columns drawn one after the other** (the two-column fixture in `packages/core/src/ingestion/testing.ts`): the page reads in order, the left column and then the right one. An integration test keeps this.
- **Rows drawn across both columns** (a manual check with a PDF that draws left line 1, right line 1, left line 2, …): the page text alternates the columns line by line. The blocks and their boxes are correct, but a passage mixes the two columns.

**Decision:** keep pdf.js. We do not know yet how court systems draw their two-column pages, so the extraction check (`pnpm --filter @consta/evals extraction-check <case-file.pdf>`) on the pilot's real case files decides. If they read out of order, first sort the blocks by column inside `PdfPageReader`, which already splits blocks at the column gap; add the Python extractor only if that is not sufficient.
