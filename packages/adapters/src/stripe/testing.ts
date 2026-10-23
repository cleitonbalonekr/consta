import { readFileSync } from "node:fs";
import Stripe from "stripe";
import { StripeBilling } from "./index";

/** The webhook signing secret the tests sign with, as `stripe listen` would print one. */
const WEBHOOK_SECRET = "whsec_test_recorded";

/** The customer every recorded payload names. */
export const RECORDED_CUSTOMER = "cus_TqLawyerAna01";

export const PRO_PRICE = "price_1SxProMonthly";

export type RecordedWebhook =
  | "subscription-created"
  | "subscription-incomplete"
  | "subscription-cancel-at-period-end"
  | "subscription-past-due"
  | "subscription-unpaid"
  | "subscription-deleted"
  | "second-subscription-created"
  | "checkout-session-completed";

/** A Stripe event as Stripe signs it: the payload and its Stripe-Signature header. */
export function signed(payload: string): [payload: string, signature: string] {
  return [payload, new Stripe("sk_test_offline").webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET })];
}

/** A recorded payload from `./recorded`, signed now. */
export function recorded(name: RecordedWebhook): [payload: string, signature: string] {
  return signed(readRecorded(name));
}

function readRecorded(name: RecordedWebhook) {
  return readFileSync(new URL(`./recorded/${name}.json`, import.meta.url), "utf8");
}

/**
 * Stripe's API without a network, for a StripeBilling in tests. It holds the customer's
 * subscriptions as the recorded events left them, and Checkout sessions that are still open.
 */
export class OfflineStripe {
  readonly billing = new StripeBilling({
    secretKey: "sk_test_offline",
    webhookSecret: WEBHOOK_SECRET,
    proPriceId: PRO_PRICE,
    fetch: (input, init) => this.answer(new URL(String(input)), init?.method ?? "GET", String(init?.body ?? "")),
  });
  readonly requests: Array<{ method: string; path: string; body: URLSearchParams }> = [];
  readonly openSessions = new Set<string>();
  private readonly subscriptions = new Map<string, { id: string }>();
  private sessions = 0;

  /** Stripe's state once the recorded event has happened, before its webhook arrives. */
  happens(name: RecordedWebhook): this {
    // The recorded payloads are Stripe events.
    const event = JSON.parse(readRecorded(name)) as { data: { object: { id: string; object: string } } };
    if (event.data.object.object === "subscription") this.subscriptions.set(event.data.object.id, event.data.object);
    return this;
  }

  private async answer(url: URL, method: string, body: string): Promise<Response> {
    this.requests.push({ method, path: url.pathname, body: new URLSearchParams(body) });
    const route = `${method} ${url.pathname}`;
    if (route === "POST /v1/customers") return json({ id: RECORDED_CUSTOMER, object: "customer" });
    if (route === "GET /v1/subscriptions") return list([...this.subscriptions.values()]);
    if (route === "GET /v1/checkout/sessions") return list([...this.openSessions].map((id) => ({ id, object: "checkout.session" })));
    if (route === "POST /v1/checkout/sessions") {
      const id = `cs_test_offline_${++this.sessions}`;
      this.openSessions.add(id);
      return json({ id, object: "checkout.session", url: `https://checkout.stripe.com/c/pay/${id}` });
    }
    const expired = url.pathname.match(/^\/v1\/checkout\/sessions\/(.+)\/expire$/);
    if (method === "POST" && expired?.[1]) {
      this.openSessions.delete(expired[1]);
      return json({ id: expired[1], object: "checkout.session", status: "expired" });
    }
    if (route === "POST /v1/billing_portal/sessions") return json({ id: "bps_offline", object: "billing_portal.session", url: "https://billing.stripe.com/p/session/test_offline" });
    return json({ error: { type: "invalid_request_error", message: `OfflineStripe doesn't answer ${route}.` } }, 404);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function list(data: unknown[]) {
  return json({ object: "list", data, has_more: false, url: "/v1/list" });
}
