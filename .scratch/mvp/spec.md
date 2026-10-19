# MVP

Build the Consta MVP described in `prd-mvp.md`: a lawyer uploads one very large case file, gets a document map, and asks questions whose every statement cites its page.

## Sources of truth

- Product scope, metrics and phases: `prd-mvp.md`
- Domain language: `CONTEXT.md`
- Modules, ports and seams: `docs/architecture.md`, decisions in `docs/adr/`
- How to write and test code: `docs/agents/coding-standards.md`, `docs/agents/testing.md`

## Local first

Every ticket runs and is tested on a laptop. Two local modes:

1. **Fake mode** (the default): fake adapters for every external service, local Postgres and object storage from Docker Compose. Needs no accounts, keys or network.
2. **Real-adapter mode**: the same local Postgres and object storage, with real AI providers (keys with low spend limits) and Trigger.dev's local dev runner.

Unit, component and integration tests run without Docker. E2E runs against a production build on the laptop, in fake mode.

## Tickets

Tracer bullets in `issues/`, numbered so blockers come first. The frontier is every ticket whose blockers are done.

| # | Ticket | Blocked by |
| --- | --- | --- |
| 01 | UI prototype with mocked modules | none |
| 02 | Sign in with a magic link | 01 |
| 03 | Deploy the pilot environment and CI | 02 |
| 04 | Upload a case file | 02 |
| 05 | Ingest digital pages with progress | 04 |
| 06 | Read scanned pages with OCR (deferred, ADR-0010) | 05 |
| 07 | Ask about the whole case file | 05 |
| 08 | Open a citation in the viewer | 07 |
| 09 | Build the document map and facts | 05 |
| 10 | Ask about one peça, and summarize | 07, 09 |
| 11 | Quick actions from facts | 07, 09 |
| 12 | Delete a case file | 04 |
| 13 | Email when ingestion ends | 05 |
| 14 | Answer feedback | 07 |
| 15 | Operator cost page | 07 |
| 16 | Plans and billing | 03, 04 |
