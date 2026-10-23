import { InvalidWebhook } from "@consta/core";
import type { Billing, BillingChange } from "@consta/core/ports";
import Stripe from "stripe";

export type StripeBillingOptions = {
  secretKey: string;
  /** The signing secret of the webhook endpoint (whsec_...); `stripe listen` prints one locally. */
  webhookSecret: string;
  /** The Price of Pro's monthly subscription. */
  proPriceId: string;
  /** Answers Stripe's API in place of the network; tests pass one. */
  fetch?: typeof fetch;
};

/** Events that report a subscription's state. Stripe sends them in no guaranteed order. */
const SUBSCRIPTION_EVENTS = new Set(["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"]);

/**
 * A past-due subscription keeps Pro while Stripe retries the card; Stripe moves it to unpaid or
 * canceled when retries end. An incomplete one is still waiting for its first payment (3D Secure).
 */
const PAYING_STATUSES = new Set<Stripe.Subscription.Status>(["active", "trialing", "past_due"]);

/**
 * Pro through Stripe Checkout and the Customer Portal. Each lawyer has one Stripe customer,
 * created before their first Checkout, and a webhook only names the customer: whether they
 * pay is read from their subscriptions now, whatever order the events arrive in.
 */
export class StripeBilling implements Billing {
  private readonly stripe: Stripe;

  constructor(private readonly options: StripeBillingOptions) {
    this.stripe = new Stripe(options.secretKey, options.fetch ? { httpClient: Stripe.createFetchHttpClient(options.fetch) } : {});
  }

  async createCustomer({ lawyer, email }: Parameters<Billing["createCustomer"]>[0]) {
    // The key makes a retry within a day return the same customer instead of a second one.
    const customer = await this.stripe.customers.create({ email, metadata: { lawyerId: lawyer } }, { idempotencyKey: `customer-${lawyer}` });
    return customer.id;
  }

  async checkoutUrl({ lawyer, billingCustomer, returnUrl }: Parameters<Billing["checkoutUrl"]>[0]) {
    for await (const open of this.stripe.checkout.sessions.list({ customer: billingCustomer, status: "open" })) {
      await this.stripe.checkout.sessions.expire(open.id);
    }
    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: this.options.proPriceId, quantity: 1 }],
      client_reference_id: lawyer,
      customer: billingCustomer,
      subscription_data: { metadata: { lawyerId: lawyer } },
      success_url: returnUrl,
      cancel_url: returnUrl,
      locale: "pt-BR",
    });
    // A hosted session always has a URL; only embedded sessions have none.
    return session.url!;
  }

  async portalUrl({ billingCustomer, returnUrl }: Parameters<Billing["portalUrl"]>[0]) {
    const session = await this.stripe.billingPortal.sessions.create({ customer: billingCustomer, return_url: returnUrl });
    return session.url;
  }

  /** Any of the customer's subscriptions to Pro's price counts, so a second one keeps Pro when the first ends. */
  async isPaying(billingCustomer: string) {
    for await (const subscription of this.stripe.subscriptions.list({ customer: billingCustomer, status: "all" })) {
      const isPro = subscription.items.data.some((item) => item.price.id === this.options.proPriceId);
      if (isPro && PAYING_STATUSES.has(subscription.status)) return true;
    }
    return false;
  }

  async readWebhook(payload: string, signature: string): Promise<BillingChange | null> {
    const event = this.verified(payload, signature);
    if (!SUBSCRIPTION_EVENTS.has(event.type)) return null;
    // The event types above all carry a subscription.
    const { customer } = event.data.object as Stripe.Subscription;
    return { billingCustomer: typeof customer === "string" ? customer : customer.id };
  }

  private verified(payload: string, signature: string): Stripe.Event {
    try {
      return this.stripe.webhooks.constructEvent(payload, signature, this.options.webhookSecret);
    } catch (error) {
      if (error instanceof Stripe.errors.StripeSignatureVerificationError) throw new InvalidWebhook(error.message);
      throw error;
    }
  }
}
