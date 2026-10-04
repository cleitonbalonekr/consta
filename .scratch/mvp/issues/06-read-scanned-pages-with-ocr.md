# 06: Read scanned pages with OCR

**What to build:** Ingestion classifies each page as digital or scanned. Scanned pages are gathered into a small PDF and read by OCR, keeping their text blocks, bounding boxes and confidence, so citations on scanned pages can be marked too. Ingestion also detects the court-stamped folha on any page and stores it. Fake mode uses the fake OCR; real-adapter mode uses Mistral OCR with a key.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] Page classification sends only pages without usable text to OCR
- [ ] The Mistral OCR adapter is implemented with a contract test; each call records its page cost through Metering
- [ ] Scanned pages store text, blocks with boxes, and OCR confidence
- [ ] Folha detection reads the "fls." stamp where present and leaves it empty otherwise
- [ ] Unit tests cover the classifier and the folha parser with real-looking samples
- [ ] Integration tests ingest a scanned fixture with the fake OCR
- [ ] The extraction check script from ticket 05 includes scanned pages and reports OCR cost per 1,000 pages
- [ ] Works locally in both modes
