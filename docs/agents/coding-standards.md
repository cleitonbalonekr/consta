# Coding standards

Rules for every change in `apps/` and `packages/`. The architecture they serve is in `docs/architecture.md`; the words they use are in `CONTEXT.md`.

## Design

- **Deep modules** (single responsibility, small interfaces). New behaviour goes inside an existing module's implementation, behind its `index.ts`. Grow a module's interface only when a caller needs the new capability.
- **Inject dependencies through constructors** (dependency inversion). A module is a class that receives its ports and the `UnitOfWork` in its constructor; only the composition roots (`apps/web/src/server/container.ts`, `apps/jobs/src/container.ts`) choose adapters.
- **A port earns its place with two adapters**: production and fake. With one real implementation, call it directly.
- **SQL lives only in repositories** (ADR-0006). Each module reads and writes Postgres through its own repository port; a Drizzle adapter implements it, an in-memory fake stands in for it in unit tests. Migrations and tests may also touch the database. Work that must commit together runs inside `UnitOfWork.run`, which hands it transaction-bound repositories.
- **Build for the current ticket** (YAGNI). Ship what its acceptance criteria need. Options, flags, parameters and abstractions arrive with the ticket that asks for them.
- **One home per rule** (DRY). Domain rules (citations, page quota, status transitions) live in exactly one module. For code, extract on the third copy, and only when the copies share a meaning, not just a shape.
- **Backend logic lives in classes** (ADR-0007). In `packages/`, modules, entities, value objects, adapters and fakes are classes. Functions are for the frontend UI and for framework entry points (route handlers, server actions, Trigger.dev tasks), which only validate input and call a module. No shared base classes.
- **The simplest code that passes the tests** (KISS). A class holds one concept and its rules; split it when it holds two.

## Code

- **Name things with the glossary.** Identifiers use the `CONTEXT.md` terms (`caseFile`, `peca`, `statement`, `citation`, `lawyer`) and skip the words it lists under _Avoid_. Identifiers are English; copy shown to lawyers is Portuguese (pt-BR).
- **Small functions at one level of abstraction**, with early returns. A function past about 30 lines is a prompt to split it.
- **Types carry invariants**: value objects that validate in a static `from` (`PageRange`), branded ids, unions for statuses, non-empty tuples (`Statement.citations`). Validate outside data at the edge (adapters, route handlers, server actions) and hand the core typed values.
- **Errors**: throw a `DomainError` subclass for a case the caller handles; let unexpected errors propagate to the runtime's error boundary.
- **Comments explain why**, in one or two lines. Interfaces get a doc comment that states call order, invariants and error modes.
- **Casts and `any` live at edges only**, each with a comment saying why the type system can't see it.
- **Logs hold ids and counts.** Case-file text, questions and answers stay out of logs and error reports (ADR-0005).

## Done

A change is done when `pnpm typecheck`, `pnpm lint` and `pnpm test` pass, its tests follow `docs/agents/testing.md`, and `CONTEXT.md` or `docs/adr/` reflect any term or hard-to-reverse decision it changed.
