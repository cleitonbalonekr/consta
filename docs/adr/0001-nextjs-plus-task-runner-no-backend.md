# Next.js plus a task runner, no separate backend

All request/response work runs in the Next.js app, and ingestion runs as Trigger.dev tasks built from the same TypeScript packages. A Vercel function stops after 300 seconds with 2 GB of memory, while ingesting a 3,600-page, 400 MB case file takes 20 to 40 minutes, so ingestion can't run inside a request. An always-on backend would add a monthly cost and a second deploy target with no benefit at 1 to 10 lawyers.

## Considered Options

- **Next.js alone**: blocked by the function time and memory limits.
- **NestJS or FastAPI on a VM**: a fixed monthly cost and one more thing to deploy and watch.
- **Inngest**: its steps run inside our own Vercel functions, so each step keeps the same limits.

## Consequences

Web code reaches Trigger.dev only through the `Jobs` port, and Trigger.dev is Apache-2.0 and self-hostable, so leaving Trigger.dev Cloud means swapping one adapter or self-hosting it.
