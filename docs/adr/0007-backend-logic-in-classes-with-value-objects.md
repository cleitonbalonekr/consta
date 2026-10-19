---
status: accepted
---

# Backend logic uses classes, value objects and a case file entity

Code in `packages/core` and `packages/adapters` uses classes. A module is a class that gets its ports in its constructor. A domain concept that has rules is a value object or an entity, and its rules stay inside it. We took these concepts from the DDD course repository ([cleitonbalonekr/mba-domain-driven-design](https://github.com/cleitonbalonekr/mba-domain-driven-design)). A class keeps a rule and its data together, so a reader finds the rule where the data is, and a caller cannot change the data without the rule. Functions stay in the frontend UI: React components, hooks and client helpers.

This replaces the rule "plain functions and data first" and the `create*` factories in the coding standards.

## Considered options

- **Plain functions and data** (the earlier rule). Rejected: the rules of one concept go into many separate functions, and a caller can make a `PageRange` or a status change that breaks a rule.
- **The course's base classes** (`Entity`, `AggregateRoot`, `ValueObject`, `MyCollection`). Rejected: they compare values with lodash `isEqual` and type ids as `any`. Each class here writes its own small `equals` when a caller needs it.
- **Domain events, integration events, RabbitMQ and a stored-events table.** Rejected for now: each effect (the ready email, pages given back, the start of ingestion) has one consumer, so a direct port call is sufficient. ADR-0001 and ADR-0002 permit only Postgres and Trigger.dev. If we need reliable events, we add an outbox table in Postgres, with a new ADR.

## Consequences

- **Value objects** have `readonly` fields, a private constructor and a static `from` that validates the input and throws a `DomainError` subclass. They do not change after construction. Examples: `PageRange` (`first` is 1 or more and not more than `last`), `PageNumber`, `Folha`, `Citation`.
- **Ids stay branded strings.** Ids go through URLs, JSON and SQL, and a class would need a conversion at each of these boundaries. The edge validates them.
- **The `CaseFile` entity owns the status lifecycle** in `docs/architecture.md`. Its methods change the status and throw `InvalidStatus` for a transition that the diagram does not show. The Case files repository loads and saves `CaseFile` instances.
- **A unit of work contains only database work.** Calls to external services (`Jobs`, `FileStore`, `Mailer` and the AI ports) occur before or after `uow.run`, not in it, because a rollback cannot undo them. In the course, `OrderService` commits in the middle of its work and calls the payment gateway between the two commits. This rule prevents that problem.
- **Framework entry points stay functions**, because the frameworks require them: Next.js route handlers, server actions and Trigger.dev task definitions. They only validate the input and call a module.
- **Existing code moves to classes when a ticket changes it.** Metering moves in ticket 04, Ingestion in ticket 05 and Answering in ticket 07.
