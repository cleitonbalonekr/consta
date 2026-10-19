# 03: Deploy the pilot environment and CI

**What to build:** The signed-in app runs in production for the pilot, and every pull request is checked automatically. Production uses the services and regions in `prd-mvp.md`: Vercel in São Paulo, Neon in São Paulo, Cloudflare R2, Trigger.dev, and Resend with a verified sending domain. A merge to the main branch migrates the database, deploys the tasks and deploys the web app. This needs a human for the accounts, domain, keys and provider settings.

**Blocked by:** 02

**Status:** ready-for-human

- [x] A GitHub remote exists and the issue tracker setup is updated if issues move to GitHub
- [ ] Vercel (region `gru1`), Neon (São Paulo), R2 bucket with CORS for our domain (exposing `ETag`), Trigger.dev production project and Resend domain are created
- [ ] Production secrets live in Vercel and Trigger.dev settings, never in the repo; `.env.example` lists every variable
- [ ] Anthropic and Voyage are on paid tiers with training off and monthly spend limits set (ADR-0005)
- [ ] GitHub Actions runs typecheck, lint, unit, component and integration tests on every pull request, and the E2E suite against a production build
- [ ] A merge to main runs migrations, then `trigger deploy`, then the Vercel deploy from the same commit
- [ ] Signing in on the production URL works end to end
- [x] The README explains how to reproduce the CI checks locally

## Comments

**2026-10-07, repo side done; accounts and settings left for a human.** `pnpm typecheck`, `pnpm lint`, every test tier and the 16 E2E journeys (`CI=1 pnpm test:e2e`) pass locally with the exact CI commands.

- The GitHub remote is `cleitonbalonekr/consta`. Issues stay in `.scratch/`, so the tracker setup doesn't change.
- `.github/workflows/ci.yml` runs on every pull request: typecheck, lint, unit, component and integration in one job, E2E against the production build in another. No secrets needed.
- `.github/workflows/deploy.yml` runs on push to `main`: CI checks, `pnpm db:migrate`, `trigger deploy`, `vercel pull/build/deploy --prebuilt --prod`, then `curl $PRODUCTION_URL/api/health`. It uses the GitHub `production` environment.
- `apps/web/vercel.json` pins functions to `gru1` and turns off Vercel's Git deploy for `main`, so the deploy workflow alone ships production after migrations. Pull request previews stay on.
- `.env.example` now also lists the deploy workflow's GitHub secrets and variables.

Left for the human: create the Vercel project (root directory `apps/web`), Neon (`aws-sa-east-1`), the R2 bucket and CORS, the Trigger.dev project, the Resend domain, and the AI provider tiers and limits; enter the secrets in Vercel, Trigger.dev and the GitHub `production` environment; merge to `main` and sign in on the production URL.
