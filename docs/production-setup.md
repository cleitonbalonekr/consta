# Production setup

One-time steps that only a human can do, in third-party dashboards. The code reads everything else from environment variables (`.env.example` lists them all).

## Stripe

Billing uses three settings: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `STRIPE_PRO_PRICE_ID`. Set it up once in test mode on your machine, then again in live mode for production. Test and live mode don't share products, prices, portal settings or webhooks.

### 1. Test mode, locally

1. **Product and price.** In the Stripe dashboard, switch to **Test mode**. In Product catalog, add a product "Consta Pro" with a **recurring monthly** price in BRL. Copy the price id (`price_...`) into `STRIPE_PRO_PRICE_ID` in `.env`.
2. **Secret key.** In Developers, API keys, copy the test secret key (`sk_test_...`) into `STRIPE_SECRET_KEY`.
3. **Customer Portal.** In Settings, Billing, Customer portal, turn on **payment method updates** and **subscription cancellation**, then click **Save**. The app uses the default portal settings, so the portal won't open until they have been saved once.
4. **Webhooks.** Install the Stripe CLI and forward the subscription events to the app:

   ```sh
   brew install stripe/stripe-cli/stripe
   stripe login
   stripe listen --events customer.subscription.created,customer.subscription.updated,customer.subscription.deleted --forward-to localhost:3000/api/billing/webhook
   ```

   Copy the signing secret it prints (`whsec_...`) into `STRIPE_WEBHOOK_SECRET`, then restart `pnpm dev`. Keep `stripe listen` running in its own terminal.
5. **Try it.** Sign in, open `/plano`, click "Assinar o Pro" and pay with the test card `4242 4242 4242 4242` (any future expiry date, any CVC). Reload `/plano`: once the webhook arrives, the plan shows Pro. Click again to open the Customer Portal. Cancel there and check that the plan goes back to Trial.

Setting `STRIPE_SECRET_KEY` uses Stripe even with `CONSTA_ADAPTERS=fake`, and then all three settings are required. Clear the key to go back to the fake.

### 2. Live mode, in production

1. **Product and price.** In live mode, create the "Consta Pro" monthly price again, or use "Copy to live mode" on the test product. Note the live price id.
2. **Customer Portal.** Save the Customer Portal settings again in live mode, with the same options as in test mode.
3. **Webhook endpoint.** In Developers, Webhooks, add an endpoint:
   - URL: `https://<production domain>/api/billing/webhook`
   - Events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`

   Copy the endpoint's signing secret (`whsec_...`). It is not the one `stripe listen` prints.
4. **Vercel.** In the Vercel project's settings, add these environment variables to Production. The deploy workflow pulls them from Vercel, so they don't go in GitHub.

   | Variable | Value |
   |---|---|
   | `STRIPE_SECRET_KEY` | the live secret key, `sk_live_...` |
   | `STRIPE_WEBHOOK_SECRET` | the endpoint's signing secret from step 3 |
   | `STRIPE_PRO_PRICE_ID` | the live `price_...` from step 1 |

5. **Branding (recommended).** In Settings, Business and Branding, set the business name and logo. Checkout shows them, in Portuguese.
6. **Check it.** After the next deploy, subscribe with a real card, check that `/plano` shows Pro, then cancel in the Customer Portal and refund the payment in the dashboard.
