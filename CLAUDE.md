## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Code standards

Before writing or changing code, read `docs/agents/coding-standards.md`: design rules (deep modules, injected ports, YAGNI) and code rules.

## Tests

Every change ships with tests in each tier it touches (unit, component, integration, E2E). Tier suffixes and E2E conventions: `docs/agents/testing.md`.
