# Citations are enforced by construction, not by prompting

Answering sends the model its sources as blocks that each belong to exactly one page, uses the model's native citations, and drops every statement that arrives without a citation before the lawyer sees it. Prompting a model to "always cite" fails silently, and an uncited or wrong citation is the exact failure this product exists to prevent.

## Consequences

- A passage never crosses a page break.
- Answers stream one statement at a time, not token by token, because a statement can be shown only after its citations are known.
- A model provider without native citations must emulate them inside its adapter; the rest of the system doesn't change.
