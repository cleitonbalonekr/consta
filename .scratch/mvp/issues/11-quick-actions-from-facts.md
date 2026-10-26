# 11: Quick actions from facts

**What to build:** Timeline, People and Amounts answer from the facts recorded at ingestion instead of from search, so the lists are complete. Each fact becomes a source labelled with its page, and the model writes the cited list. Every item in the answer cites the page its fact came from.

**Blocked by:** 07, 09

**Status:** ready-for-human

- [x] Each quick action selects the matching fact kinds for the case file
- [x] Quick action questions are saved with `scope = 'whole-file'` and their `quick_action`
- [x] Every statement cites the page of its fact; uncited statements are dropped as in ticket 07
- [x] Integration tests cover each quick action with seeded facts
- [x] E2E covers running each quick action in fake mode
- [ ] Works locally in both modes

## Comments

**2026-10-26, implemented; real-adapter mode needs a person.** `pnpm typecheck`, `pnpm lint` and `pnpm test` pass (core 393, adapters 64 with 14 skipped, web 66). E2E: all 28 journeys pass (`pnpm test:e2e`, with `docker compose up -d`). The quick-action journeys and the tablet layout journey no longer have `test.fixme()`.

Not verified, so "Works locally in both modes" stays open: real-adapter mode was not run, as there is no `ANTHROPIC_API_KEY` here. A person must run the three quick actions on a real case file with the real Claude adapter.

Decisions:

- **Kinds:** Timeline reads `date` and `event` facts, People reads `person` and `role`, and Amounts reads `amount` (`QUICK_ACTIONS` in Answering, which also holds the saved text and the prompt).
- **One source per fact,** titled with its page and folha. Its one block reads `value (normalizedValue), context`, and the normalized value is left out when it equals the value. That block is the citation's quote. Facts are read in page order, and by value within a page.
- **No marked lines** (agreed with the user): facts store no boxes, so the viewer opens the fact's page with nothing marked.
- **No fact of the kinds:** the model is not called, and the saved answer has no statement.
- **Fake mode:** by default, `FakeMapExtractor` now records one fact of every kind on each page with text.

Follow-ups worth a ticket:

- Quick actions have no size limit, unlike the peça budget. A case file with thousands of date or event facts sends them all to the model.
- People lists `role` facts as their own sources, and nothing links a role to its person, so the list can have a bare role such as "Autora".
