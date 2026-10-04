# 03: Deploy the pilot environment and CI

**What to build:** The signed-in app runs in production for the pilot, and every pull request is checked automatically. Production uses the services and regions in `prd-mvp.md`: Vercel in São Paulo, Neon in São Paulo, Cloudflare R2, Trigger.dev, and Resend with a verified sending domain. A merge to the main branch migrates the database, deploys the tasks and deploys the web app. This needs a human for the accounts, domain, keys and provider settings.

**Blocked by:** 02

**Status:** ready-for-human

- [ ] A GitHub remote exists and the issue tracker setup is updated if issues move to GitHub
- [ ] Vercel (region `gru1`), Neon (São Paulo), R2 bucket with CORS for our domain (exposing `ETag`), Trigger.dev production project and Resend domain are created
- [ ] Production secrets live in Vercel and Trigger.dev settings, never in the repo; `.env.example` lists every variable
- [ ] Anthropic, Voyage and Mistral are on paid tiers with training off and monthly spend limits set (ADR-0005)
- [ ] GitHub Actions runs typecheck, lint, unit, component and integration tests on every pull request, and the E2E suite against a production build
- [ ] A merge to main runs migrations, then `trigger deploy`, then the Vercel deploy from the same commit
- [ ] Signing in on the production URL works end to end
- [ ] The README explains how to reproduce the CI checks locally
