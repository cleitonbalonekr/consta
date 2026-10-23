import { createHmac, randomUUID } from "node:crypto";
import { InvalidWebhook } from "../../shared";
import type { Billing, BillingChange } from "../billing";

/**
 * Records the hosted pages asked for and returns Stripe-like URLs, which E2E journeys
 * intercept in the browser. `paying` holds the customers who pay for Pro. Webhooks are
 * changes as JSON, signed by `sign` with a secret no one else knows, so none can be forged.
 */
export class FakeBilling implements Billing {
  readonly customers: Array<Parameters<Billing["createCustomer"]>[0]> = [];
  readonly checkouts: Array<Parameters<Billing["checkoutUrl"]>[0]> = [];
  readonly portals: Array<Parameters<Billing["portalUrl"]>[0]> = [];
  readonly paying = new Set<string>();
  private readonly secret = randomUUID();

  async createCustomer(input: Parameters<Billing["createCustomer"]>[0]) {
    this.customers.push({ ...input });
    return `cus_fake_${this.customers.length}`;
  }

  async checkoutUrl(input: Parameters<Billing["checkoutUrl"]>[0]) {
    this.checkouts.push({ ...input });
    return `https://checkout.stripe.com/c/pay/cs_test_fake_${this.checkouts.length}`;
  }

  async portalUrl(input: Parameters<Billing["portalUrl"]>[0]) {
    this.portals.push({ ...input });
    return `https://billing.stripe.com/p/session/test_fake_${this.portals.length}`;
  }

  async isPaying(billingCustomer: string) {
    return this.paying.has(billingCustomer);
  }

  async readWebhook(payload: string, signature: string) {
    if (signature !== this.signature(payload)) throw new InvalidWebhook("The webhook signature doesn't match its payload.");
    // The signature matched, so `sign` wrote this payload from a BillingChange or null.
    return JSON.parse(payload) as BillingChange | null;
  }

  /** The payload and signature of a webhook reporting `change`; null is an event about no plan. */
  sign(change: BillingChange | null): [payload: string, signature: string] {
    const payload = JSON.stringify(change);
    return [payload, this.signature(payload)];
  }

  private signature(payload: string) {
    return createHmac("sha256", this.secret).update(payload).digest("hex");
  }
}
