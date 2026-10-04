# 01: UI prototype with mocked modules

**What to build:** A lawyer can click through the whole MVP journey on a laptop with fake data: see their case files, upload one and watch ingestion progress page by page, read the document map, ask about the whole case file or one peça, run the quick actions, and click a citation to open the viewer at the cited page with the quoted text marked. The screens get their data only through the `CaseFiles` and `Answering` interfaces, served by in-memory demo implementations that the web composition root selects from an environment variable. Later tickets replace the demo implementations without touching the screens. This ticket also sets up the test tiers from `docs/agents/testing.md`.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] With no accounts, keys or Docker, `pnpm dev` shows a seeded case file with its document map, backed by a small sample PDF committed to the repo
- [ ] Uploading any PDF creates a new case file whose status moves through uploading, queued, processing ("page N of M"), mapping and ready within a few seconds
- [ ] The quota-exceeded and failed states each have a screen the lawyer can reach in demo mode
- [ ] A whole-file question streams statements one at a time; each statement shows its citations as the page, plus "fls." when the page has a folha
- [ ] A scripted uncited statement never reaches the screen
- [ ] Choosing a peça from the document map scopes the question to it; Timeline, People and Amounts return cited lists
- [ ] Clicking a citation opens the viewer at that page with the quoted text marked
- [ ] Deleting a case file asks for confirmation and removes it from the list
- [ ] Screens import only the `CaseFiles` and `Answering` interfaces; switching to the real modules changes only the composition root
- [ ] Copy is Portuguese (pt-BR); the layout is designed for desktop and usable on a tablet
- [ ] Every control a journey touches carries an `id`, following `docs/agents/testing.md`
- [ ] Test tiers exist: unit, component and integration Vitest projects, and Playwright against a production build in demo mode; root scripts run each tier; the existing core tests use the tier suffixes
- [ ] Component tests cover statement and citation rendering and the progress display
- [ ] E2E journeys cover: upload to ready, ask and open a citation, ask about a peça, delete a case file
- [ ] `pnpm test` passes without Docker, and the E2E suite passes locally
