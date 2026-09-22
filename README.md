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
cp .env.example .env          # CONSTA_ADAPTERS=fake needs no keys
docker compose up -d          # Postgres with pgvector on localhost:5432
pnpm db:migrate
pnpm dev                      # http://localhost:3000
```

## Checks

```bash
pnpm typecheck
pnpm lint                     # includes the module boundary rules
pnpm test                     # core tests run on PGlite, no Docker needed
```
