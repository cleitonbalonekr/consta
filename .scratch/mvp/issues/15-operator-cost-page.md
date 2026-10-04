# 15: Operator cost page

**What to build:** The operator opens a protected page and sees, for a chosen month, the cost per lawyer and per case file, split by kind (OCR, embedding, reranking, extraction, answers), from the usage records. Only operators listed in configuration can open it.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] The page is reachable only by operator emails listed in configuration
- [ ] Totals per lawyer and per case file, by usage kind, for a chosen month
- [ ] Integration tests cover the totals from seeded usage records
- [ ] E2E covers an operator viewing the page and a lawyer being refused
- [ ] Works locally in fake mode
