# 18: Refuse a peça whose digital pages have no text

**What to build:** A peça is refused as `not-readable` when none of its digital pages has a block, the same as a peça whose pages are all scanned. Today `pecaPages` (`packages/core/src/answering/index.ts`) only checks that some page is digital, while `pecaReading` keeps only digital pages that have blocks. A peça whose one digital page has an empty text layer passes the check, gives zero passages, skips the model, and saves an empty answer as done.

**Blocked by:** none

**Status:** needs-triage

- [ ] A peça with digital pages but no blocks is refused as `not-readable`, and no question is saved
- [ ] A peça with at least one digital page that has a block is answered as today
- [ ] Unit test through `Answering`, integration test on PGlite

## Comments

**2026-10-23:** found by the code review of `feat/operator-cost-page-and-billing`. The bug comes from earlier commits (`7c22fee`, `f972647`), not that branch.
