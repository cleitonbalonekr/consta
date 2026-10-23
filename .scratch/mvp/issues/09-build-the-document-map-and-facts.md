# 09: Build the document map and facts

**What to build:** When every page is read, ingestion builds the document map: each peça's type, title, date, page range and a short summary. It also records facts (people, roles, dates, amounts, events), each with its page. A model reads windows of pages; peças that cross a window edge are merged. The lawyer sees the document map before asking anything, and clicking a peça opens its first page. Fake mode uses the fake map extractor. This is the Phase 3 gate in `prd-mvp.md`.

**Blocked by:** 05

**Status:** ready-for-human

- [x] `Ingestion.map` builds peças and facts from page windows, merging a peça that continues across windows, then marks the case file ready
- [x] The Claude map extractor adapter returns structured peças and facts, with a contract test; usage is metered
- [ ] The extractor uses Claude Haiku 5.5, and each window of pages stays under 100,000 tokens: above that, its price goes up 5 times. If Haiku 5.5 fails the document map check, use Claude Sonnet 5.5 and record the result
- [x] `fact (case_file_id, page)` references `page (case_file_id, number)`; `peca` has `CHECK (first_page <= last_page)`
- [x] The real document map replaces the demo one in the UI
- [x] Unit tests cover window merging; integration tests cover the map step with the fake extractor
- [x] E2E covers seeing the document map after ingestion and opening a peça's first page
- [x] A document map check script in `packages/evals` compares the map of a real case file with the lawyer's own index
- [ ] Works locally in both modes

## Comments

**2026-10-22, implemented; two checks need a person.** `pnpm typecheck`, `pnpm lint` and `pnpm test` pass (core 290, adapters 37 with 13 skipped, web 50). E2E: 14 journeys pass and 6 are `test.fixme()` (`CI=1 pnpm test:e2e`, with `docker compose up -d`). The branch is stacked on ticket 08 (PR #4), because a peça opens in its viewer.

Not verified, so two boxes stay open:

- **Real mode.** The local `ANTHROPIC_API_KEY` is not scoped to a workspace: the API answers 400 and asks for an `anthropic-workspace-id` header, before any model runs. The Claude contract tests (`packages/adapters/src/anthropic/anthropic.integration.test.ts`, the citing model's too) therefore did not run. `ClaudeMapExtractor` is covered by its unit test with a stubbed `fetch` only. A workspace-scoped key, or the workspace id, is needed, also for production.
- **The document map check.** `ANTHROPIC_API_KEY=… pnpm --filter @consta/evals map-check <case-file.pdf> <index.json>` needs a real case file and the lawyer's own index of it, which are not in the repository. If Haiku 5.5 finds under 90% of the peças, run it again with `MAP_MODEL=claude-sonnet-5-5`, record both results here, and change the model in `AdaptersFromEnv.mapExtractor`.

Decisions:

- **One Messages call per window, not the Batch API.** A batch can take up to 24 hours, and the case file would wait in `mapping`. Haiku 5.5 costs about 0.55 USD for a 3,600-page case file this way, against about 0.28 in a batch; batching can come later as a cost lever.
- **A window holds 90,000 characters of page text** (`MAP_WINDOW_CHARS`), about 30,000 tokens of Portuguese: far under the 100,000 tokens above which Haiku 5.5 costs five times as much, with room for the instructions and the open peça, and small enough that a window's peças and facts fit in one answer. A page longer than that is a window alone. The cost uses the higher rate when a prompt does pass 100,000 tokens.
- **Merging** (`ingestion/document-map.ts`): the extractor gets the last peça so far as the open peça. A peça the next window returns starting before the window is the open peça going on, whatever first page the model gave it; it replaces the open peça from the open peça's first page, so the later reading, which saw more of it, wins. Of two such peças, the one that goes furthest is kept; with no open peça (the first window), it starts at the window's first page instead of being dropped. What the model places past its window is dropped, a peça ends at the window's last page at the latest, and a fact is kept only on a digital page of the window: no statement comes from a scanned page (ADR-0010).
- **The map is saved once, after every window**, with the case file marked ready in the same run. A failed window leaves nothing behind, and the step runs again once (as before). Each window's cost is recorded as soon as it returns, so a retry pays again for the windows already read.
- **Each page goes to the extractor with its source** (`PageText`). A scanned page is marked unread in the prompt, so a peça can span it; a blank digital page is shown as read, with no text.
- **A date that is no YYYY-MM-DD day of the calendar becomes no date** (`CalendarDate.parse` in `shared/values.ts`), so a 2026-02-30, or a 00 day or month that a model writes for an unknown one, can't fail the whole step at the `date` column.
- **Structured output** (`output_config.format`, JSON schema with the peça types and fact kinds as enums), streamed, `max_tokens` 32,000, effort `medium`. A refusal, `max_tokens` or an answer without JSON throws, so the step runs again. Haiku 5.5 has no server-side fallback.
- **Clicking a peça opens the viewer at its first page**, with its type, pages and title above the page, and still scopes the next question to it. Asking about one peça and the quick actions still throw `NotImplemented` (tickets 10 and 11), as before.
- **The fake extractor maps each window as peças of two pages**, of the types of a lawsuit in order, so fake mode and E2E show a document map; its usage counts the words read, like the fake citing model.
- **`ClaudePrices`** now holds the price table for both Claude adapters.

**2026-10-22, the Claude contract tests pass with a workspace-scoped key.** All 6 cases of `packages/adapters/src/anthropic/anthropic.integration.test.ts` pass against the real API: the 4 `MapExtractor` cases on Claude Haiku 5.5 (6 to 7 s each, so that describe now has a 60 s timeout) and the 2 `CitingModel` cases on Sonnet 5.5. Still open: the whole app in real mode, and the document map check on a real case file with the lawyer's own index.

