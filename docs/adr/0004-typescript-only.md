# TypeScript only, with Python allowed only inside ingestion's text extraction

The whole system is TypeScript and uses pdf.js and pdf-lib for PDF work, although Python has the stronger PDF and retrieval ecosystem. One language keeps one toolchain and one deploy, and PyMuPDF's AGPL-3.0 licence is a risk for a closed-source SaaS. If pdf.js mixes up two-column pages in the Phase 1 test, a Python extractor (pypdfium2 or Docling) runs as a Trigger.dev task inside Ingestion, and nothing outside Ingestion changes.
