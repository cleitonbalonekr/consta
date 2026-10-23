# 16: Plans and billing

**What to build:** A lawyer on Trial upgrades to Pro through Stripe Checkout and manages billing in the Stripe Customer Portal. The plan sets the monthly page quota; a Stripe webhook keeps the lawyer's plan in sync. Locally it runs with Stripe test keys and the Stripe CLI forwarding webhooks.

**Blocked by:** 03, 04

**Status:** ready-for-human

- [x] Checkout upgrades Trial to Pro; the Customer Portal handles card changes and cancellation
- [x] The webhook verifies its signature, updates the plan and page quota, and is idempotent
- [x] Quota checks use the current plan's page quota
- [x] Integration tests cover each webhook event with recorded payloads
- [x] E2E covers reaching Checkout from the quota-exceeded screen, with Stripe mocked at the network edge
- [ ] Works locally with Stripe test keys and the Stripe CLI

## Comments

**2026-10-23, repo side done; a Stripe test-mode run is left for a human.** `pnpm typecheck`, `pnpm lint`, `pnpm test` and the E2E suite pass. Nothing has run against Stripe itself yet, so the last box stays open.

- A new `Billing` port has a Stripe adapter (`packages/adapters/src/stripe`) and `FakeBilling`. `Plans`, a part of Metering's interface like `CaseFileLifecycle` is of Case files, sends a lawyer on Trial to Checkout and a lawyer who has paid to the Customer Portal, and applies the webhook at `/api/billing/webhook`.
- The webhook verifies Stripe's signature (a 400 if it doesn't match) and reads only `customer.subscription.created|updated|deleted`. `active`, `trialing` and `past_due` mean Pro (5,000 pages); anything else, or a deleted subscription, means Trial (500). The page quota is stored with the plan, so quota checks use the current plan without other changes.
- Checkout writes the lawyer's id into the subscription's metadata, so every event names its lawyer. No event depends on `checkout.session.completed` arriving first.
- Idempotent and safe out of order: migration 0007 adds `lawyer_plan.plan_changed_at` and `billing_customer`. A change older than the last one applied does nothing, so a repeated or late event leaves the newest state.
- Integration tests run 7 payloads in Stripe's event shape (`src/stripe/recorded/`) through `Plans` on PGlite. I wrote them by hand from Stripe's documented format; nothing was recorded from a live account. Replacing them with real `stripe listen` captures is a good follow-up.
- E2E: the quota-exceeded screen and `/plano` both reach Checkout. The fake returns a `https://checkout.stripe.com/...` URL, and Playwright answers that request in the browser.
- Settings: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`. Setting the secret key uses Stripe even in fake mode. The README has the local `stripe listen` steps.

Left for the human: create the Pro product and its monthly price in Stripe, turn on the Customer Portal (card updates and cancellation), run the README's local steps with test keys and pay with `4242 4242 4242 4242`. For production, add a webhook endpoint for the three subscription events and put the three settings in Vercel. The 5,000-page Pro quota comes from the PRD's worked example; set the price from the pilot's `usage_event` data.

Code review changes and known risks:

- An `incomplete` subscription (waiting for 3D Secure) changes no plan. Without this, it could arrive in the same second as `active` and leave a paying lawyer on Trial.
- A webhook never changes an Enterprise plan.
- Not handled yet:
  - A lawyer who opens Checkout twice before the first webhook arrives can end up with two Stripe subscriptions. Cancelling one then moves them to Trial while the other still bills.
  - A `billing_customer` that already belongs to another lawyer makes the webhook answer 500, so Stripe retries.
  - A lawyer back on Trial after Pro gets 500 pages every month. The monthly Trial quota predates this ticket; the PRD's Trial is one case file.

