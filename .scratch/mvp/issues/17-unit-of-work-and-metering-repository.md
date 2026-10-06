# 17: Unit of work and the Metering repository

**What to build:** The `UnitOfWork` port from ADR-0006, with a Drizzle adapter and an in-memory fake, and Metering moved onto its own repository so it holds no SQL. `startTrial` and `pagesLeft` keep their behaviour. This is the first module on the new pattern; the other modules move to it in the tickets that implement them (04, 05, 07).

**Blocked by:** none

**Status:** done

- [x] `UnitOfWork` and `Repositories` port types in `packages/core/src/ports/unit-of-work.ts`, as sketched in `docs/architecture.md`; `Repositories` holds only `metering` for now, and the other modules add theirs when they need one
- [x] `MeteringRepository` type in `packages/core/src/metering/`, shaped by what Metering needs (find the plan, sum this month's charges, insert a plan if none exists), not by its tables
- [x] Drizzle adapters for `UnitOfWork` and `MeteringRepository` in `packages/core/src/db/repositories/`; a run inside a run joins the outer transaction
- [x] In-memory fakes for both in `packages/core/src/ports/fakes/`; a run that throws leaves the fake state as it was, and a run inside a run joins the outer one
- [x] `createMetering` takes `{ uow: UnitOfWork }`, not `{ db: Db }`; `packages/core/src/metering/index.ts` no longer imports `drizzle-orm`
- [x] Both composition roots build the Drizzle `UnitOfWork`; the demo container is unchanged
- [x] A lint rule forbids `drizzle-orm` and `@consta/core/db` imports outside `src/db/`, migrations and tests
- [x] Contract tests run the same cases against the fake and the Drizzle adapters: rollback on throw, nested run joins the outer one, and the `MeteringRepository` queries
- [x] Unit tests cover `startTrial` and `pagesLeft` through `createMetering` with the fakes; the existing `metering.integration.test.ts` cases move to the unit tier
- [x] Integration tests on PGlite cover the Drizzle repository; the São Paulo month boundary moved into Metering and is a unit test (see comments)

## Comments

**2026-10-05, done.** `pnpm typecheck`, `pnpm lint` and `pnpm test` pass (83 tests). E2E was not run: the demo container did not change.

- `UnitOfWork` and `Repositories` are in `src/ports/unit-of-work.ts`. `MeteringRepository` is exported from `src/metering/index.ts`, so ports and adapters can import it without reaching into the module folder.
- A run inside a run joins the outer one through `AsyncLocalStorage`, in both the Drizzle adapter and the fake.
- The fake (`InMemoryUnitOfWork`) copies its state with `structuredClone` before a run and puts it back on a throw. Two runs at the same time are not isolated, so row locks stay a Postgres test.
- Changed from the plan: the start of the month in São Paulo is now computed in Metering (`startOfMonthInSaoPaulo`, with `Intl`), not in SQL. The repository receives a `since` date. Thus the monthly window rule lives in Metering, as `docs/architecture.md` says, and a unit test covers the boundary with an injected `now`.
- The shared contracts are in `src/ports/contracts/`. The fake runs them in the unit tier and Drizzle runs them on PGlite.
- Case files, Ingestion and Answering now take `uow` in place of `db`. They are still stubs, so nothing else changed.
