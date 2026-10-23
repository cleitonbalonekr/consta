import type { Page } from "@playwright/test";

/** Stripe Checkout's host. The E2E server's fake Billing sends lawyers there; nothing in E2E reaches Stripe. */
export const STRIPE_CHECKOUT = /^https:\/\/checkout\.stripe\.com\//;

/** Mocks Stripe at the network edge: the browser's request to Checkout gets a stand-in page. */
export async function mockStripeCheckout(page: Page) {
  await page.route(STRIPE_CHECKOUT, (route) => route.fulfill({ contentType: "text/html", body: "<title>Stripe Checkout</title>" }));
}
