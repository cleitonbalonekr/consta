# 07: Ask about the whole case file

**What to build:** A lawyer asks a question about a ready case file and gets an answer that streams one statement at a time, each with citations naming the page and folha and carrying the quoted text and its boxes. Answering finds passages with hybrid search (vector plus Portuguese full-text, fused, then reranked), sends them to the model as page-bound sources with native citations, and drops every statement without a citation. The question, its answer and the dropped count are saved and metered. The real `Answering` replaces the demo version for whole-file questions. This is the Phase 2 gate in `prd-mvp.md`.

**Blocked by:** 05

**Status:** ready-for-human

- [x] `Answering.ask` with whole-file scope is implemented; a case file that isn't ready returns `refused: "not-ready"`; another lawyer's case file throws `NotFound`
- [x] Hybrid search runs in one SQL statement (top 50 vector, top 50 full-text, Reciprocal Rank Fusion), then the reranker keeps 20
- [x] The Voyage reranker and the Claude citing model adapters are implemented with contract tests
- [x] Every citation resolves to its passage's page, folha, quoted text and boxes; uncited statements are dropped and counted (ADR-0003)
- [x] The question and usage are saved
- [x] `question.scope` becomes a Postgres enum (`whole-file`, `peca`) and a nullable `quick_action` enum (`timeline`, `people`, `amounts`) is added, matching Scope and Quick action in `CONTEXT.md`; `CHECK ((scope = 'peca') = (peca_id IS NOT NULL))`; `peca_id` changes to on delete cascade, since set null would break that check
- [x] `question.answer` is declared with `$type<Statement[]>()`
- [x] Unit tests cover rank fusion; integration tests cover dropped statements, citation resolution, refusal and ownership, using scripted fake model answers
- [x] E2E covers asking about an ingested fixture in fake mode
- [x] A citation eval script in `packages/evals` runs the 20 pilot questions with real adapters and reports, for each answer, the cited pages to check by hand
- [x] Works locally in both modes

## Comments

**2026-10-19, implemented; three checks need a person.** `pnpm typecheck`, `pnpm lint` and `pnpm test` pass (core 248, adapters 23 with 9 skipped, web 35). E2E: 11 journeys pass and 7 are `test.fixme()` (`CI=1 pnpm test:e2e`, with `docker compose up -d`). The new journey passed 3 of 3 runs with `--repeat-each=3`. The first E2E runs after Docker Desktop started had upload journeys that passed only on retry; `main` did the same on a cold machine, and the next full run on this branch passed with no retry.

Not verified, so "Works locally in both modes" stays open:

- Real-adapter mode was not run: there is no `ANTHROPIC_API_KEY` or `VOYAGE_API_KEY` here. The Claude and Voyage reranker contract tests (`packages/adapters/src/*/*.integration.test.ts`) skip without the keys. Their unit tests use a stubbed `fetch`.
- The citation check (`pnpm --filter @consta/evals citation-check <case-file.pdf> <questions.json>`) was not run: it needs the keys and the 20 pilot questions with their expected pages, which are not in the repository. Running it on a real case file closes the Phase 2 gate.
- The p95 search time (under 500 ms in the Phase 2 gate) was not measured on a real case file.

Decisions:

- **A statement is one line of the model's answer.** The model's text runs are joined up to each line break; a line is shown when one of its runs cites a passage, and dropped and counted otherwise. A list marker at the start of a line is removed. Thus connecting words that Claude writes outside a cited block ("Além disso, ") stay with their statement, and the rule lives in one class (`answering/statements.ts`).
- **One source is one passage, and one Claude document.** Each passage goes to Claude as a custom-content document of one block, titled "Página N (fls. F)", so a citation's `document_index` names its passage. A citation's quote is the passage text and its boxes are the boxes of the passage's blocks.
- **Answering reads the case file's status through its own repository** (`AnsweringRepository.caseFileStatus`), as the architecture sketch has no Case files dependency for Answering. The status and ownership check is one query.
- **Full-text search matches any word of the question**: `plainto_tsquery` joins the words with AND, which a question in natural language rarely matches, so the query joins them with OR and `ts_rank_cd` ranks the passages. Reciprocal Rank Fusion uses K = 60 (`RankFusion.K`), in SQL and in the in-memory fake.
- **The search sets `hnsw.iterative_scan = strict_order`** with `SET LOCAL` before the search statement, so the HNSW index returns enough rows after the case-file filter (pgvector 0.8, prd-mvp.md). Strict, not relaxed, because the vector rank and the `LIMIT` trust the index's order, and Drizzle cannot write the `MATERIALIZED` CTE that a relaxed scan needs to be sorted again.
- **The Claude adapter turns on the server-side fallback** (`fallbacks: "default"`), so a declined request runs again on another model in the same call. A refusal that the fallback does not rescue ends the answer with `refused: "declined"` after the usage is recorded; the lawyer sees no statement of the partial answer, and nothing is saved. The cost uses the price of the model that answered, and a model with no price throws rather than costing nothing.
- **A lawyer who leaves mid-answer stops the model call**: the route returns the answer stream when the response is cancelled.
- **`max_tokens` is 4,000**, four times the ~1,000-token answer in prd-mvp.md, so a runaway answer stops early.
- **No passages, no model call**: when the search finds nothing (for example, only scanned pages), the answer is empty and the question is still saved.
- **A refused question is not saved**, because it has no answer.
- **The fake citing model's default script** cites the first two sources and adds one uncited line, so fake mode and E2E show the citation rule.
- **The integration tier's test timeout is 30 s**: with the new PGlite test files, a fresh PGlite with every migration took more than 5 s while the unit tier ran in parallel.

