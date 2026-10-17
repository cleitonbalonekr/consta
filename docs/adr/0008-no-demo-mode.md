---
status: accepted
---

# The app has no demo mode, and local runs use Docker Compose

The web app always uses the real modules on Postgres and S3-compatible storage. We removed the in-memory demo modules (`CONSTA_MODULES=demo`) and their seeded case file, simulated ingestion and scripted answers. When a module has a real implementation, a second copy of its behaviour in the app adds work and can show a lawyer a behaviour that production does not have. Tests use fakes where they need them: the port fakes in `packages/core` and mocks in component tests.

## Considered options

- **Keep the demo modules beside the real ones.** Rejected: each ticket must change two implementations, and the demo keeps rules (quota, status, ownership) that the real modules own.
- **Run the real Case files in demo mode, on the in-memory fakes.** Rejected: the browser uploads parts directly to storage, so an in-memory store needs a special route in the app that production does not have.

## Consequences

- Local runs and E2E need Postgres and MinIO: `docker compose up -d`. Fake adapters (`CONSTA_ADAPTERS=fake`) still replace the paid services, so no accounts or keys are necessary.
- E2E journeys make the state they need through the app. A journey that needs a state that the app cannot make yet (a ready case file before tickets 05 and 07) stays in the suite as `test.fixme()`.
- The CI workflow must start Postgres and MinIO as service containers before it runs the S3 contract test and E2E.
