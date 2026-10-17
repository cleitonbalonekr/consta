# 06: Read scanned pages with OCR

**Deferred (ADR-0010):** the MVP reads digital pages only. Do this ticket when the pilot's case files hold more than about 10% scanned pages, or when the lawyer asks about a scanned page. Ticket 05 already classifies pages, marks scanned pages as not read and detects the folha.

**What to build:** Scanned pages, which ticket 05 marks as not read, are gathered into a small PDF and read by OCR, keeping their text blocks, bounding boxes and confidence, so citations on scanned pages can be marked too. Fake mode uses the fake OCR; real-adapter mode uses Mistral OCR with a key.

**Blocked by:** 05

**Status:** needs-info

- [ ] The `Ocr` port and its `FakeOcr` come back (removed by ADR-0010; restore them from git history), with a contract both adapters pass
- [ ] Ingestion sends only the pages that ticket 05 classified as `scanned` to OCR, and the lawyer no longer sees them as not read
- [ ] `MISTRAL_API_KEY` is back in `.env.example` and `adaptersFromEnv`, and Mistral is back in ADR-0005, the data statement and the spend guards
- [ ] The Mistral OCR adapter is implemented with a contract test; each call records its page cost through Metering
- [ ] Scanned pages store text, blocks with boxes, and OCR confidence
- [ ] Integration tests ingest a scanned fixture with the fake OCR
- [ ] The extraction check script from ticket 05 includes scanned pages and reports OCR cost per 1,000 pages
- [ ] Works locally in both modes
