# 16: Plans and billing

**What to build:** A lawyer on Trial upgrades to Pro through Stripe Checkout and manages billing in the Stripe Customer Portal. The plan sets the monthly page quota; a Stripe webhook keeps the lawyer's plan in sync. Locally it runs with Stripe test keys and the Stripe CLI forwarding webhooks.

**Blocked by:** 03, 04

**Status:** ready-for-agent

- [ ] Checkout upgrades Trial to Pro; the Customer Portal handles card changes and cancellation
- [ ] The webhook verifies its signature, updates the plan and page quota, and is idempotent
- [ ] Quota checks use the current plan's page quota
- [ ] Integration tests cover each webhook event with recorded payloads
- [ ] E2E covers reaching Checkout from the quota-exceeded screen, with Stripe mocked at the network edge
- [ ] Works locally with Stripe test keys and the Stripe CLI
