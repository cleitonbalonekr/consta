# Consta

Ask questions about a very large Brazilian case file; every statement in the answer cites the page that supports it.

- Product: [`prd-mvp.md`](./prd-mvp.md)
- Domain language: [`CONTEXT.md`](./CONTEXT.md)
- Architecture: [`docs/architecture.md`](./docs/architecture.md) and decisions in [`docs/adr/`](./docs/adr/)

## Layout

```text
apps/web            Next.js app (composition root: src/server/container.ts)
apps/jobs           Trigger.dev tasks for ingestion
packages/core       modules (case-files, ingestion, answering, metering), ports, fakes, database schema
packages/adapters   vendor adapters (R2/S3, Voyage, Claude, Resend, Trigger.dev, Stripe)
packages/evals      quality runs against real providers (run by hand)
```

## Getting started

You need a Trigger.dev account with access to the Consta project. Do these steps one time:

1. Run `pnpm --filter @consta/jobs exec trigger login`.
2. Copy `.env.example` to `.env`.
3. In the Trigger.dev dashboard, open the project's API keys for the "Development" environment. Copy the secret key (`tr_dev_...`) into `TRIGGER_SECRET_KEY` in `.env`.

Then:

```bash
nvm use                       # Node 24
pnpm install
docker compose up -d          # Postgres with pgvector on localhost:5432, MinIO on localhost:9000
pnpm db:migrate
pnpm dev:jobs                 # first terminal: runs the Trigger.dev tasks on this machine
pnpm dev                      # second terminal: http://localhost:3000
```

The app always uses the real modules on Postgres and MinIO, and it always sends ingestion to Trigger.dev. With fake adapters (`CONSTA_ADAPTERS=fake`, the default), you do not need keys for the paid services. Fakes replace the AI providers and email, and the app uses the MinIO settings of `docker-compose.yml`. `pnpm dev` and `pnpm dev:jobs` read the `.env` at the repository root.

Sign in with an email address. With fake adapters, the app does not send email. The terminal that runs `pnpm dev` shows the sign-in link as `Sign-in link for <email>: <url>`. Open this link to go to your case files.

After an upload, the "View runs" link of `pnpm dev:jobs` shows the `ingest-case-file` run. Until ticket 05, this run fails, because Ingestion is not implemented yet, and the case file stays at "queued".

### Operator cost page

`/operador/custos` shows what the paid providers cost per lawyer and per case file, for one month. Only the emails in `OPERATOR_EMAILS` (comma-separated) can open it; anyone else gets a 404. With fake adapters every cost is 0 USD, but the rows still appear.

### Plans and billing with Stripe

Without Stripe keys, the "Assinar o Pro" buttons lead to a fake Checkout URL. To pay with Stripe's test mode:

1. In the Stripe dashboard, in test mode, create a product "Consta Pro" with a monthly price. Copy the price id (`price_...`) into `STRIPE_PRO_PRICE_ID`, and the test secret key (`sk_test_...`) into `STRIPE_SECRET_KEY`.
2. Turn on the Customer Portal (Settings, Billing, Customer portal) with card updates and cancellation.
3. Install the Stripe CLI, run `stripe login`, then forward webhooks to the app:

   ```sh
   stripe listen --events customer.subscription.created,customer.subscription.updated,customer.subscription.deleted --forward-to localhost:3000/api/billing/webhook
   ```

   Copy the signing secret it prints (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`, then restart `pnpm dev`.
4. Pay with the test card `4242 4242 4242 4242`. Back on `/plano`, reload to see Pro once the webhook arrives.

To change a setting, edit `.env`. The MinIO console is at http://localhost:9001 (user `consta`, password `consta-secret`).

## Checks

```bash
pnpm typecheck
pnpm lint                     # includes the module boundary rules
pnpm test                     # unit, component and integration tiers; the S3 contract test needs Docker Compose
pnpm test:unit                # or one tier: test:component, test:integration
pnpm test:e2e                 # Playwright against a production build; needs Docker Compose
```

Before you run the S3 contract test or E2E, start the services with `docker compose up -d`. The E2E server applies the migrations before it starts. The first E2E run needs a browser: `pnpm --filter @consta/web exec playwright install chromium`. Each journey signs in as a new lawyer through the link the server logs; Playwright writes the server's output to `apps/web/e2e-server.log` for that, so a server you start yourself on port 3100 must write its output there too.

## Continuous integration

Every pull request runs `.github/workflows/ci.yml`. To reproduce it locally, from a clean install:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm test:component
pnpm test:integration         # PGlite in-process; the S3 contract test needs MinIO
pnpm --filter @consta/web exec playwright install --with-deps chromium   # once
CI=1 pnpm test:e2e            # CI=1 builds a fresh server instead of reusing one on port 3100
```

None of these need accounts or keys: the E2E server sets `CONSTA_JOBS=inline`, so it runs ingestion in its own process and does not send it to Trigger.dev. Locally, the S3 contract test and E2E need Postgres and MinIO from `docker compose up -d`. CI starts the same images as service containers.

## Deployment

A merge to `main` runs `.github/workflows/deploy.yml`: the CI checks, then `pnpm db:migrate` on production, then `trigger deploy`, then the Vercel production deploy, all from the same commit, and finally a request to `/api/health` on the production URL. Vercel's own Git deploy is off for `main` (`apps/web/vercel.json`) so the web app never ships ahead of its migrations; pull requests still get Vercel preview deploys.

Production runs in São Paulo: Vercel functions in `gru1` and Neon in `aws-sa-east-1`. Runtime secrets live in the Vercel and Trigger.dev production settings; the deploy workflow's own secrets live in the GitHub `production` environment. `.env.example` lists every variable. `docs/production-setup.md` has the one-time dashboard steps, such as Stripe's.
