# 07: Ask about the whole case file

**What to build:** A lawyer asks a question about a ready case file and gets an answer that streams one statement at a time, each with citations naming the page and folha and carrying the quoted text and its boxes. Answering finds passages with hybrid search (vector plus Portuguese full-text, fused, then reranked), sends them to the model as page-bound sources with native citations, and drops every statement without a citation. The question, its answer and the dropped count are saved and metered. The real `Answering` replaces the demo version for whole-file questions. This is the Phase 2 gate in `prd-mvp.md`.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] `Answering.ask` with whole-file scope is implemented; a case file that isn't ready returns `refused: "not-ready"`; another lawyer's case file throws `NotFound`
- [ ] Hybrid search runs in one SQL statement (top 50 vector, top 50 full-text, Reciprocal Rank Fusion), then the reranker keeps 20
- [ ] The Voyage reranker and the Claude citing model adapters are implemented with contract tests
- [ ] Every citation resolves to its passage's page, folha, quoted text and boxes; uncited statements are dropped and counted (ADR-0003)
- [ ] The question and usage are saved
- [ ] Unit tests cover rank fusion; integration tests cover dropped statements, citation resolution, refusal and ownership, using scripted fake model answers
- [ ] E2E covers asking about an ingested fixture in fake mode
- [ ] A citation eval script in `packages/evals` runs the 20 pilot questions with real adapters and reports, for each answer, the cited pages to check by hand
- [ ] Works locally in both modes
