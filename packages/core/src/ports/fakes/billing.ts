import { createHash } from "node:crypto";
import { InvalidWebhook, LawyerId } from "../../shared";
import type { Billing, PlanChange } from "../billing";

/**
 * Records the hosted pages asked for and returns Stripe-like URLs, which E2E journeys
 * intercept in the browser. Webhooks are plan changes as JSON, signed by `sign`.
 */
export class FakeBilling implements Billing {
  readonly checkouts: Array<Parameters<Billing["checkoutUrl"]>[0]> = [];
  readonly portals: Array<Parameters<Billing["portalUrl"]>[0]> = [];

  async checkoutUrl(input: Parameters<Billing["checkoutUrl"]>[0]) {
    this.checkouts.push({ ...input });
    return `https://checkout.stripe.com/c/pay/cs_test_fake_${this.checkouts.length}`;
  }

  async portalUrl(input: Parameters<Billing["portalUrl"]>[0]) {
    this.portals.push({ ...input });
    return `https://billing.stripe.com/p/session/test_fake_${this.portals.length}`;
  }

  async readWebhook(payload: string, signature: string) {
    if (signature !== this.signature(payload)) throw new InvalidWebhook("The webhook signature doesn't match its payload.");
    // The signature matched, so `sign` wrote this payload from a PlanChange or null.
    const change = JSON.parse(payload) as { lawyer: string; billingCustomer: string; paying: boolean; at: string } | null;
    return change && { ...change, lawyer: LawyerId(change.lawyer), at: new Date(change.at) };
  }

  /** The payload and signature of a webhook reporting `change`; null is an event that changes no plan. */
  sign(change: PlanChange | null): [payload: string, signature: string] {
    const payload = JSON.stringify(change);
    return [payload, this.signature(payload)];
  }

  private signature(payload: string) {
    return createHash("sha256").update(payload).digest("hex");
  }
}
