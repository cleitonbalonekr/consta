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
- Each lawyer gets one Stripe customer, created when they first open Checkout and stored in `lawyer_plan.billing_customer` (migration 0007). A webhook only names the customer; `Plans` locks the lawyer's plan and asks Stripe whether the customer pays for Pro now (any `active`, `trialing` or `past_due` subscription to Pro's price). Repeated, late and same-second events, and a lawyer's second subscription, all end on Stripe's current state.
- Integration tests run 8 payloads in Stripe's event shape (`src/stripe/recorded/`) through `Plans` on PGlite, with `OfflineStripe` answering Stripe's API from the subscriptions those events leave. I wrote them by hand from Stripe's documented format; nothing was recorded from a live account. Replacing them with real `stripe listen` captures is a good follow-up.
- E2E: the quota-exceeded screen and `/plano` both reach Checkout. The fake returns a `https://checkout.stripe.com/...` URL, and Playwright answers that request in the browser.
- Settings: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`. Setting the secret key uses Stripe even in fake mode. The README has the local `stripe listen` steps.

Left for the human: create the Pro product and its monthly price in Stripe, turn on the Customer Portal (card updates and cancellation), run the README's local steps with test keys and pay with `4242 4242 4242 4242`. For production, add a webhook endpoint for the three subscription events and put the three settings in Vercel. The 5,000-page Pro quota comes from the PRD's worked example; set the price from the pilot's `usage_event` data.

Code review changes and known risks:

- An `incomplete` subscription (waiting for 3D Secure) is not paying, so the lawyer stays on Trial until the payment goes through.
- A webhook never changes an Enterprise plan, and Checkout refuses (`NotOnTrial`) a lawyer on a plan set outside it.
- Second review: no one pays twice. Checkout sends a lawyer whom Stripe already shows paying to the portal, even before the webhook arrives, and expires the customer's other open Checkout sessions. A webhook for a customer Consta didn't create changes nothing, so `billing_customer` can't conflict.
- `Plans.view` starts the Trial of a lawyer whose sign-up hook didn't, so the case-file list never fails for a missing plan.
- `FakeBilling` signs webhooks with a per-process secret, so a deployment in fake mode can't be sent a forged one.
- A database that ran the first version of migration 0007 has an unused `plan_changed_at` column; reset it or drop the column by hand.
- Not handled yet: a lawyer back on Trial after Pro gets 500 pages every month. The monthly Trial quota predates this ticket; the PRD's Trial is one case file.
