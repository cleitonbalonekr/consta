# 14: Answer feedback

**What to build:** Under each answer, a lawyer can mark it useful or not, and flag any citation as pointing to the wrong page. Feedback is saved with the question and feeds the evaluation set.

**Blocked by:** 07

**Status:** ready-for-agent

- [ ] Thumbs up or down per answer and a "wrong page" flag per citation are saved with the question
- [ ] A lawyer can change their feedback; another lawyer's question can't be changed
- [ ] `question.feedback` is declared with `$type<…>()`; a "wrong page" flag names its citation by statement index and citation index in `answer`
- [ ] Integration tests cover saving, changing and ownership
- [ ] Component tests cover the feedback controls
- [ ] E2E covers flagging a citation in fake mode
- [ ] Works locally in fake mode
