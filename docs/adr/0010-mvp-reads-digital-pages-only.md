---
status: accepted
---

# The MVP reads digital pages only; scanned pages wait for OCR

Ingestion reads the text of digital pages with pdf.js and does not OCR scanned pages. It still classifies every page, stores a scanned page as `scanned` with no text, and shows the lawyer which pages it did not read. OCR is the largest variable cost of an ingest (about 2 to 4 USD per 1,000 scanned pages) and one more vendor that reads client data (ADR-0005), and the pilot can start without it if its case files are mostly digital.

## Considered options

- **Mistral OCR from the first release.** Deferred: it adds a vendor, its data-use review and most of the ingest cost before we know the scan share of real files.
- **Claude vision as the OCR.** Deferred with OCR: it returns no bounding boxes or confidence, and its cost per page is close to Mistral's.
- **Reject a case file that has scanned pages.** Rejected: most digital files hold some scanned attachments (laudos, contracts), and the lawyer still gains from the digital pages.

## Consequences

- A statement can never cite a scanned page, so the lawyer must see the unread pages. An answer that says "the file does not mention X" is only about the pages Consta read.
- The schema keeps `page_source = 'scanned'`, `ocr_confidence` and the `ocr` usage kind, so OCR comes back with no migration.
- The `Ocr` port, its fake and the Mistral adapter are removed from the code. Ticket 06 keeps their design; it adds them again when the pilot shows that scanned pages matter.
- Revisit this when the pilot's case files hold more than about 10% scanned pages, or when the lawyer asks about a scanned page.
