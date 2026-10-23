# 15: Operator cost page

**What to build:** The operator opens a protected page and sees, for a chosen month, the cost per lawyer and per case file, split by kind (OCR, embedding, reranking, extraction, answers), from the usage records. Only operators listed in configuration can open it.

**Blocked by:** 07

**Status:** done

- [x] The page is reachable only by operator emails listed in configuration
- [x] Totals per lawyer and per case file, by usage kind, for a chosen month
- [x] Integration tests cover the totals from seeded usage records
- [x] E2E covers an operator viewing the page and a lawyer being refused
- [x] Works locally in fake mode

## Comments

**2026-10-23, done.** `pnpm typecheck`, `pnpm lint`, `pnpm test` and the E2E suite (`CI=1 pnpm test:e2e`, 21 passed, 5 fixme skips from earlier tickets) pass.

- The page is `/operador/custos?mes=YYYY-MM` (this month by default, with previous and next links). `OPERATOR_EMAILS` lists the operators, comma-separated and case-insensitive; a signed-in lawyer not on it gets a 404, so the page doesn't show it exists.
- `Metering.costs(month)` returns totals by usage kind for each lawyer and each of their case files, most expensive first. It sums in millionths of a dollar, the precision of `usage_event.cost_usd`, so totals don't drift.
- `Month` (in `metering/`) is the São Paulo calendar month. The page-quota window uses it now, in place of the old `startOfMonthInSaoPaulo`.
- `MeteringRepository.costsBetween` joins `user` for the email and `case_file` for the name. Usage whose case file was deleted shows as "Sem autos". `usage_event` has no foreign key to `user`, so a left join keeps the costs of a deleted lawyer.
- Tests: `Month` and `Metering.costs` unit tests, a repository contract case (fake and PGlite), a `Metering.costs` integration test on seeded `usage_event` rows, a component test, and two E2E journeys (an operator sees a lawyer's case file; a lawyer gets a 404).
