---
status: superseded in part by ADR-0006
---

# Postgres holds everything, and modules use it directly

Rows, vectors (pgvector), Portuguese full-text search, ingestion progress and usage all live in one Postgres database, and hybrid search is a single SQL statement. Modules query Postgres through Drizzle directly instead of through a repository port: Postgres can run locally in tests (PGlite or Postgres in Docker), so a port would be a seam with only one real adapter. This deliberately departs from the PRD's first draft, which put a `SearchIndex` port in front of the database.

**Superseded in part:** ADR-0006 keeps Postgres as the only database but puts every query behind a repository port.

## Consequences

- Moving between Postgres hosts (Neon, Supabase, RDS) is a dump and restore.
- Moving away from Postgres, for example to a dedicated vector database, means rewriting the search SQL. We accept that and revisit only if p95 search time passes 500 ms.
