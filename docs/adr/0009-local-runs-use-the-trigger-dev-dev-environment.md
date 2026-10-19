---
status: accepted
---

# Local runs send ingestion to the Trigger.dev dev environment, also with fake adapters

`CONSTA_ADAPTERS=fake` replaces only the paid AI providers and email. The web app always uses the Trigger.dev `Jobs` adapter, and `pnpm dev:jobs` (`trigger dev`) runs the tasks on the developer's machine for the project's Trigger.dev Cloud "Development" environment. Locally, ingestion then goes through the same tasks, payloads, retries and fan-out as in production.

## Considered options

- **Run ingestion in-process in fake mode (inline `Jobs`).** Rejected for `pnpm dev`: the task definitions, the JSON payloads and the batch fan-out never run locally, so their bugs show only after a deploy.
- **Self-host Trigger.dev in Docker Compose.** Rejected for now: it adds a webapp, Redis, ClickHouse, Electric, a registry and a supervisor (several GB of memory) to the local stack, only to remove the account.

## Consequences

- A local run needs a Trigger.dev account with access to the project, `trigger login`, and the dev secret key (`tr_dev_...`) in `TRIGGER_SECRET_KEY` of the root `.env`. The web app does not start without this key. This replaces "no accounts or keys are necessary" in ADR-0008 for `pnpm dev`.
- E2E and CI stay without accounts: the E2E server sets `CONSTA_JOBS=recording` (inline from ticket 05).
- `pnpm dev` and `pnpm dev:jobs` read the `.env` at the repository root. Values already in the environment win.
