import { readFileSync } from "node:fs";
import Stripe from "stripe";
import { StripeBilling } from "./index";

/** The webhook signing secret the tests sign with, as `stripe listen` would print one. */
const WEBHOOK_SECRET = "whsec_test_recorded";

/** The lawyer every recorded payload's subscription names in its metadata. */
export const RECORDED_LAWYER = "0b7e1c52-3f4a-4d8e-9b21-6c5d8e7f9a10";

export type RecordedWebhook =
  | "subscription-created"
  | "subscription-incomplete"
  | "subscription-cancel-at-period-end"
  | "subscription-past-due"
  | "subscription-unpaid"
  | "subscription-deleted"
  | "checkout-session-completed"
  | "subscription-created-elsewhere";

/** A StripeBilling that verifies with the tests' secret and never reaches the network. */
export function offlineStripeBilling() {
  return new StripeBilling({ secretKey: "sk_test_offline", webhookSecret: WEBHOOK_SECRET, proPriceId: "price_1SxProMonthly" });
}

/** A Stripe event as Stripe signs it: the payload and its Stripe-Signature header. */
export function signed(payload: string): [payload: string, signature: string] {
  return [payload, new Stripe("sk_test_offline").webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET })];
}

/** A recorded payload from `./recorded`, signed now. */
export function recorded(name: RecordedWebhook): [payload: string, signature: string] {
  return signed(readFileSync(new URL(`./recorded/${name}.json`, import.meta.url), "utf8"));
}
