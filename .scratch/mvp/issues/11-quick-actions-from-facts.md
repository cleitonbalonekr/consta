# 11: Quick actions from facts

**What to build:** Timeline, People and Amounts answer from the facts recorded at ingestion instead of from search, so the lists are complete. Each fact becomes a source labelled with its page, and the model writes the cited list. Every item in the answer cites the page its fact came from.

**Blocked by:** 07, 09

**Status:** ready-for-agent

- [ ] Each quick action selects the matching fact kinds for the case file
- [ ] Every statement cites the page of its fact; uncited statements are dropped as in ticket 07
- [ ] Integration tests cover each quick action with seeded facts
- [ ] E2E covers running each quick action in fake mode
- [ ] Works locally in both modes
