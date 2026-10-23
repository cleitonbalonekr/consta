# 10: Ask about one peça, and summarize

**What to build:** A lawyer picks a peça from the document map and asks about it, or asks for a summary. Answering reads the peça's full page range instead of searching, sends one source per page with caching on, and applies the same citation rule. A peça too large for the token budget is refused with a prompt to choose a smaller page range. Follow-up questions about the same peça reuse the cached pages.

**Blocked by:** 07, 09

**Status:** ready-for-human

- [x] Peça scope reads the full page range; a range over the token budget returns `refused: "scope-too-large"`
- [x] Sources are one per page, with caching requested
- [x] Peça questions are saved with `scope = 'peca'` and the `peca_id`
- [x] The summary preset produces cited paragraphs
- [x] Integration tests cover scope selection, the budget refusal and the caching request
- [x] E2E covers asking about a peça and requesting a summary, in fake mode
- [ ] Works locally in both modes

## Comments

**2026-10-23, implemented; real-adapter mode needs a person.** `pnpm typecheck`, `pnpm lint` and `pnpm test` pass (core 320, adapters 37 with 13 skipped, web 52). E2E: 16 journeys pass and 5 are `test.fixme()` (`CI=1 pnpm test:e2e`, with `docker compose up -d`), including the new peça question and peça summary journeys.

Not verified, so "Works locally in both modes" stays open: real-adapter mode was not run, as there is no `ANTHROPIC_API_KEY` here. A person must ask two questions about the same peça with the real Claude adapter and make sure that the second reply has `cache_read_input_tokens` above zero. A peça under about 1,024 tokens is not cached (Claude's minimum cacheable prompt).

Decisions:

- **One source per page, as this ticket says.** prd-mvp.md ("Query flow: one peça", step 3) says one custom-content document with one block per page. This ticket says one source per page, and the Claude adapter already sends each source as one document, so a citation names its page with no change to the port. Caching is the same: `cache_control` goes on the last document. prd-mvp.md is not changed; update it if this decision stays.
- **A citation of a peça page quotes the whole page and marks all its blocks**, because the source is the whole page. Narrower quotes need block-level citations from the `CitingModel` port, which is a later change.
- **The budget counts characters, not tokens**: `PECA_CHAR_BUDGET` is 450,000 characters, about 150,000 tokens at the three characters a token that Ingestion's map windows use. No token-count call is made before the answer. Very dense text can go above 150,000 tokens and still pass.
- **Scanned pages are left out** of a peça question (ADR-0010), and they do not count against the budget. A peça with only scanned pages gets an empty answer and no model call, as a whole-file question with no passages does.
- **The summary is its own `QuestionInput` variant** (`{ caseFileId, summarize: pecaId }`). The server holds the text (`SUMMARY_QUESTION`, saved as the question's text), and the instructions are the same as for every peça question, so a summary and the follow-up questions share the cached prefix. The web app shows a "Resumir esta peça" button when a peça is selected.
- **The `scope-too-large` message** now tells the lawyer to choose a smaller peça or to ask about the whole case file, because the app has no page-range picker.
- **`CONTEXT.md` has a new term, Peça summary**, so that it is not mixed up with the short summary of each peça in the document map.

