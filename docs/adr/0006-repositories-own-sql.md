---
status: accepted
---

# Repositories own all SQL, and a unit of work owns transactions

Modules no longer query Postgres directly. Each module reads and writes through its own repository port, with a Drizzle adapter for production and an in-memory fake for unit tests, so module logic is tested without a database and SQL lives in one place per module. A `UnitOfWork` port runs work in one transaction and hands it repositories bound to that transaction; its fake keeps a copy of the in-memory state and discards it when the work throws. This supersedes the "modules use it directly" part of ADR-0002; Postgres is still the only database.

## Consequences

- SQL is allowed only in repository adapters, migrations and tests.
- Every repository adapter has integration tests on a real Postgres. Hybrid search, full-text search, constraints and row locks are tested only there: the fakes cannot reproduce them.
- A fake and its Drizzle adapter must agree. Each repository has a contract test that both pass, as other ports do.
- Moving away from Postgres still means rewriting the search SQL, but only inside the repository adapters.
