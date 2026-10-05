# Consta

Ask questions about a very large Brazilian case file; every statement in the answer cites the page that supports it.

- Product: [`prd-mvp.md`](./prd-mvp.md)
- Domain language: [`CONTEXT.md`](./CONTEXT.md)
- Architecture: [`docs/architecture.md`](./docs/architecture.md) and decisions in [`docs/adr/`](./docs/adr/)

## Layout

```text
apps/web            Next.js app (composition root: src/server/container.ts)
apps/jobs           Trigger.dev tasks for ingestion
packages/core       modules (case-files, ingestion, answering, metering), ports, fakes, database schema
packages/adapters   vendor adapters (R2/S3, Mistral OCR, Voyage, Claude, Resend, Trigger.dev)
packages/evals      quality runs against real providers (run by hand)
```

## Getting started

```bash
nvm use                       # Node 24
pnpm install
pnpm dev                      # http://localhost:3000, demo modules: no accounts, keys or Docker
```

Sign in with any email: with fake adapters (the default) no email is sent, and the sign-in link is printed in the terminal running `pnpm dev`, as `Sign-in link for <email>: <url>`. Open it to land on your case files.

The web app serves in-memory demo modules by default (`CONSTA_MODULES=demo`): each lawyer starts with their own copy of a seeded case file backed by `apps/web/public/demo/autos-de-exemplo.pdf`, simulated ingestion and scripted answers. Lawyers and sessions live in memory too, so restarting the server signs everyone out. Uploading a file whose name contains `sem-cota` shows the quota-exceeded screen; one whose name contains `falha` fails halfway through ingestion. After editing the sample pages in `apps/web/src/server/demo/sample-pages.ts`, run `pnpm --filter @consta/web demo:pdf`.

To run on the real modules instead:

```bash
cp .env.example .env          # set CONSTA_MODULES=real; CONSTA_ADAPTERS=fake needs no keys
docker compose up -d          # Postgres with pgvector on localhost:5432
pnpm db:migrate
pnpm dev
```

## Checks

```bash
pnpm typecheck
pnpm lint                     # includes the module boundary rules
pnpm test                     # unit, component and integration tiers; no Docker needed
pnpm test:unit                # or one tier: test:component, test:integration
pnpm test:e2e                 # Playwright against a production build in demo mode
```

The first E2E run needs a browser: `pnpm --filter @consta/web exec playwright install chromium`. Each journey signs in as a new lawyer through the link the server logs; Playwright writes the server's output to `apps/web/e2e-server.log` for that, so a server you start yourself on port 3100 must write its output there too.
