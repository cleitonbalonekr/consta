# Coding standards

Rules for every change in `apps/` and `packages/`. The architecture they serve is in `docs/architecture.md`; the words they use are in `CONTEXT.md`.

## Design

- **Deep modules** (single responsibility, small interfaces). New behaviour goes inside an existing module's implementation, behind its `index.ts`. Grow a module's interface only when a caller needs the new capability.
- **Inject dependencies through `create*` factories** (dependency inversion). Modules receive ports and the database as arguments; only the composition roots (`apps/web/src/server/container.ts`, `apps/jobs/src/container.ts`) choose adapters.
- **A port earns its place with two adapters**: production and fake. With one real implementation, call it directly.
- **Build for the current ticket** (YAGNI). Ship what its acceptance criteria need. Options, flags, parameters and abstractions arrive with the ticket that asks for them.
- **One home per rule** (DRY). Domain rules (citations, page quota, status transitions) live in exactly one module. For code, extract on the third copy, and only when the copies share a meaning, not just a shape.
- **The simplest code that passes the tests** (KISS). Plain functions and data first; a class when it holds state, as the fakes do.

## Code

- **Name things with the glossary.** Identifiers use the `CONTEXT.md` terms (`caseFile`, `peca`, `statement`, `citation`, `lawyer`) and skip the words it lists under _Avoid_. Identifiers are English; copy shown to lawyers is Portuguese (pt-BR).
- **Small functions at one level of abstraction**, with early returns. A function past about 30 lines is a prompt to split it.
- **Types carry invariants**: branded ids, unions for statuses, non-empty tuples (`Statement.citations`). Validate outside data at the edge (adapters, route handlers, server actions) and hand the core typed values.
- **Errors**: throw a `DomainError` subclass for a case the caller handles; let unexpected errors propagate to the runtime's error boundary.
- **Comments explain why**, in one or two lines. Interfaces get a doc comment that states call order, invariants and error modes.
- **Casts and `any` live at edges only**, each with a comment saying why the type system can't see it.
- **Logs hold ids and counts.** Case-file text, questions and answers stay out of logs and error reports (ADR-0005).

## Done

A change is done when `pnpm typecheck`, `pnpm lint` and `pnpm test` pass, its tests follow `docs/agents/testing.md`, and `CONTEXT.md` or `docs/adr/` reflect any term or hard-to-reverse decision it changed.
