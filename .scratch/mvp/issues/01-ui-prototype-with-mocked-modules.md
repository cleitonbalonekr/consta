# 01: UI prototype with mocked modules

**What to build:** A lawyer can click through the whole MVP journey on a laptop with fake data: see their case files, upload one and watch ingestion progress page by page, read the document map, ask about the whole case file or one peça, run the quick actions, and click a citation to open the viewer at the cited page with the quoted text marked. The screens get their data only through the `CaseFiles` and `Answering` interfaces, served by in-memory demo implementations that the web composition root selects from an environment variable. Later tickets replace the demo implementations without touching the screens. This ticket also sets up the test tiers from `docs/agents/testing.md`.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] With no accounts, keys or Docker, `pnpm dev` shows a seeded case file with its document map, backed by a small sample PDF committed to the repo
- [x] Uploading any PDF creates a new case file whose status moves through uploading, queued, processing ("page N of M"), mapping and ready within a few seconds
- [x] The quota-exceeded and failed states each have a screen the lawyer can reach in demo mode
- [x] A whole-file question streams statements one at a time; each statement shows its citations as the page, plus "fls." when the page has a folha
- [x] A scripted uncited statement never reaches the screen
- [x] Choosing a peça from the document map scopes the question to it; Timeline, People and Amounts return cited lists
- [x] Clicking a citation opens the viewer at that page with the quoted text marked
- [x] Deleting a case file asks for confirmation and removes it from the list
- [x] Screens import only the `CaseFiles` and `Answering` interfaces; switching to the real modules changes only the composition root
- [x] Copy is Portuguese (pt-BR); the layout is designed for desktop and usable on a tablet
- [x] Every control a journey touches carries an `id`, following `docs/agents/testing.md`
- [x] Test tiers exist: unit, component and integration Vitest projects, and Playwright against a production build in demo mode; root scripts run each tier; the existing core tests use the tier suffixes
- [x] Component tests cover statement and citation rendering and the progress display
- [x] E2E journeys cover: upload to ready, ask and open a citation, ask about a peça, delete a case file
- [x] `pnpm test` passes without Docker, and the E2E suite passes locally

## Comments

**2026-10-04, done.** Implemented uncommitted on `main`. `pnpm typecheck`, `pnpm lint` and `pnpm test` pass (47 tests), and the 11 E2E journeys pass against a production build in demo mode.

- Demo modules live in `apps/web/src/server/demo/`. `CONSTA_MODULES=demo` (the default) or `real` is read only in `apps/web/src/server/container.ts`. A lint rule keeps screens away from the demo modules and the module factories.
- The seeded case file is `apps/web/public/demo/autos-de-exemplo.pdf`, generated from `sample-pages.ts` with `pnpm --filter @consta/web demo:pdf`. A file name containing `sem-cota` reaches the quota-exceeded screen; one containing `falha` reaches the failed screen.
- Only the demo state is shared across Next.js route bundles, through `globalThis`. Modules are built per bundle so that `instanceof` on domain errors works.
- Known gaps for later tickets:
  - "uploading" shows in the list and on the upload control, but not on the case file page.
  - The container carries a demo-only `demoFiles` for the demo storage route.
  - Next.js reads `.env` from `apps/web`, not the repo root.
