# 02: Sign in with a magic link

**What to build:** A lawyer enters their email, receives a sign-in link, and lands on their case files. Every app route needs a session; signed-out visitors go to sign-in. The first sign-in gives the lawyer a Trial plan with its page quota. Locally the sign-in link appears in the server console, so no email account is needed. Each lawyer sees only their own case files, including in demo mode.

**Blocked by:** 01

**Status:** done

- [x] Better Auth with magic-link sign-in and sign-out; its tables are part of the Drizzle migrations
- [x] Signed-out requests to any app route redirect to sign-in; signed-in visits to sign-in redirect to the case file list
- [x] The first sign-in creates the lawyer's Trial plan row with the Trial page quota
- [x] `Metering.pagesLeft` returns the Trial quota for a new lawyer
- [x] `lawyer_plan.lawyer_id`, `case_file.lawyer_id` and `question.lawyer_id` get foreign keys to the Better Auth user table; `usage_event` and `quota_charge` keep `lawyer_id` without one, on purpose, so billing records outlive the account
- [x] The Resend mailer adapter sends the sign-in email in real-adapter mode; in fake mode the fake mailer logs the link to the server console
- [x] Demo modules key case files by lawyer: a second lawyer sees an empty list
- [x] Integration tests cover the Trial plan on first sign-in and `pagesLeft`
- [x] Component tests cover the sign-in form states (sending, sent, error)
- [x] E2E journeys cover sign-in through the logged link, route protection, and two lawyers not seeing each other's case files
- [x] Works locally in fake mode with no accounts

## Comments

**2026-10-04, done.** `pnpm typecheck`, `pnpm lint` and `pnpm test` pass (66 tests), and the 16 E2E journeys pass against a production build in demo mode.

- Better Auth lives in `apps/web/src/server/auth.ts` (`createAuth`), built by the composition root: the Drizzle adapter on Postgres with the real modules, Better Auth's memory adapter with the demo modules. Its four tables are in `schema.ts` and migration `0002_better_auth`. Only `lawyer_plan` cascades from `user`; `case_file` and `question` block deleting an account that still has case files, so `CaseFiles.remove` stays the one place that deletes them and their PDFs.
- The Trial plan comes from a new `Metering.startTrial`, called by Better Auth's `user.create.after` hook (it runs after the user row commits). The Trial page quota is 500 pages (`prd-mvp.md`). `pagesLeft` counts charges since the start of the month in São Paulo time.
- Route protection: `src/proxy.ts` sends requests without a session cookie to `/entrar`; `currentLawyer()` checks the session itself and redirects too. Sign-out is a server action in the header.
- Decided with the user: in demo mode each lawyer starts with their own copy of the sample case file, so a second lawyer sees only their own sample, never the first lawyer's case files.
- Sign-in rate limiting is on with the Resend mailer and off with the fake one, which sends nothing; E2E signs in many lawyers from one IP.
- E2E reads the logged link from `apps/web/e2e-server.log`, which Playwright's web server command writes with `tee`. Every journey signs in as a new lawyer through an auto fixture.
- `test:unit` now runs in `packages/adapters` too (Resend mailer). `@consta/core/testing` exports `createTestDb` and `insertLawyer` for PGlite tests.

