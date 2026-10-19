# 10: Ask about one peça, and summarize

**What to build:** A lawyer picks a peça from the document map and asks about it, or asks for a summary. Answering reads the peça's full page range instead of searching, sends one source per page with caching on, and applies the same citation rule. A peça too large for the token budget is refused with a prompt to choose a smaller page range. Follow-up questions about the same peça reuse the cached pages.

**Blocked by:** 07, 09

**Status:** ready-for-agent

- [ ] Peça scope reads the full page range; a range over the token budget returns `refused: "scope-too-large"`
- [ ] Sources are one per page, with caching requested
- [ ] Peça questions are saved with `scope = 'peca'` and the `peca_id`
- [ ] The summary preset produces cited paragraphs
- [ ] Integration tests cover scope selection, the budget refusal and the caching request
- [ ] E2E covers asking about a peça and requesting a summary, in fake mode
- [ ] Works locally in both modes
