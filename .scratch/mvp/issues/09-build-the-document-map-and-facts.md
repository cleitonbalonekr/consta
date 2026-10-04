# 09: Build the document map and facts

**What to build:** When every page is read, ingestion builds the document map: each peça's type, title, date, page range and a short summary. It also records facts (people, roles, dates, amounts, events), each with its page. A model reads windows of pages; peças that cross a window edge are merged. The lawyer sees the document map before asking anything, and clicking a peça opens its first page. Fake mode uses the fake map extractor. This is the Phase 3 gate in `prd-mvp.md`.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] `Ingestion.map` builds peças and facts from page windows, merging a peça that continues across windows, then marks the case file ready
- [ ] The Claude map extractor adapter returns structured peças and facts, with a contract test; usage is metered
- [ ] The real document map replaces the demo one in the UI
- [ ] Unit tests cover window merging; integration tests cover the map step with the fake extractor
- [ ] E2E covers seeing the document map after ingestion and opening a peça's first page
- [ ] A document map check script in `packages/evals` compares the map of a real case file with the lawyer's own index
- [ ] Works locally in both modes
