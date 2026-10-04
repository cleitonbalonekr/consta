# Testing

Every change ships with automated tests in each tier it touches. A bug fix starts with a test that goes red on the bug.

## Tiers

The file suffix decides the tier. Unit, component and integration tests sit beside the code they exercise. Vitest globals stay off: every test imports `describe`, `it` and `expect`.

| Tier | Pattern | Runs in | What it exercises |
| --- | --- | --- | --- |
| unit | `*.unit.test.ts` | node | Pure functions, no I/O |
| component | `*.component.test.tsx` | jsdom (`apps/web`) | A React component rendered from props, through Testing Library |
| integration | `*.integration.test.ts` | node | A module through its `index.ts`, with PGlite and port fakes |
| e2e | `apps/web/e2e/**/*.e2e.ts` | Playwright | A lawyer's journey through the built app |

## Integration

- **The interface is the test surface.** Call the module's `index.ts` and assert on what it returns or stores; tests that reach into module internals belong to a unit tier or get rewritten.
- **Postgres is real.** Each test gets a fresh in-memory PGlite with `@electric-sql/pglite-pgvector`, migrated from `packages/core/src/db/migrations`.
- **External services are fakes** from `packages/core/src/ports/fakes`. A new port ships with its fake and a contract test that both adapters pass.

## E2E

- **Production build.** Journeys run against `next build && next start`, the same server Vercel runs, with `CONSTA_ADAPTERS=fake`: no network, no keys.
- **Layout.** `e2e/support/` holds `base.page.ts`, `fixtures.ts` and shared `components/*.component.ts`; `e2e/modules/<area>/` holds that area's `*.e2e.ts` journeys and `pages/*.page.ts`. One class per file, named for its class (`case-file.page.ts` → `CaseFilePage`).
- **Select by `id`.** Every control a journey touches carries an `id`, reached through `BasePage#byId`. Repeated rows carry a prefixed id (`peca-row-<id>`), reached with `[id^="peca-row-"]`. Visible Portuguese copy changes with wording, so it stays out of selectors; role or `aria-label` fits when the label is itself the state under assertion. New form fields get an `id` and a `<label htmlFor>`.
- **Desktop first.** Desktop Chrome is the default project, because lawyers read large case files at a desk. A tablet project covers the responsive layout only.

## Quality evals

`packages/evals` measures answer quality against real providers (citation pages, document map, extraction). Evals cost money, so they run by hand before a pilot release and never in CI.
