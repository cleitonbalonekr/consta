import { InvalidWebhook, LawyerId } from "@consta/core";
import type { Billing, PlanChange } from "@consta/core/ports";
import Stripe from "stripe";

export type StripeBillingOptions = {
  secretKey: string;
  /** The signing secret of the webhook endpoint (whsec_...); `stripe listen` prints one locally. */
  webhookSecret: string;
  /** The Price of Pro's monthly subscription. */
  proPriceId: string;
};

/** Events that report a subscription's state. Stripe sends them in no guaranteed order. */
const SUBSCRIPTION_EVENTS = new Set(["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"]);

/**
 * A subscription waiting for its first payment (3D Secure) changes no plan yet: Stripe moves it
 * to active or incomplete_expired, often in the same second, and seconds are all `created` has.
 */
const PENDING_STATUSES = new Set<Stripe.Subscription.Status>(["incomplete"]);

/** A past-due subscription keeps Pro while Stripe retries the card; Stripe moves it to unpaid or canceled when retries end. */
const PAYING_STATUSES = new Set<Stripe.Subscription.Status>(["active", "trialing", "past_due"]);

/**
 * Pro through Stripe Checkout and the Customer Portal. Checkout writes the lawyer's id
 * into the subscription's metadata, so every subscription event names its lawyer by
 * itself, whatever order the events arrive in.
 */
export class StripeBilling implements Billing {
  private readonly stripe: Stripe;

  constructor(private readonly options: StripeBillingOptions) {
    this.stripe = new Stripe(options.secretKey);
  }

  async checkoutUrl({ lawyer, email, billingCustomer, returnUrl }: Parameters<Billing["checkoutUrl"]>[0]) {
    const session = await this.stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: this.options.proPriceId, quantity: 1 }],
      client_reference_id: lawyer,
      ...(billingCustomer ? { customer: billingCustomer } : { customer_email: email }),
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

  async readWebhook(payload: string, signature: string): Promise<PlanChange | null> {
    const event = this.verified(payload, signature);
    if (!SUBSCRIPTION_EVENTS.has(event.type)) return null;
    // The event types above all carry a subscription.
    const subscription = event.data.object as Stripe.Subscription;
    const lawyer = subscription.metadata?.lawyerId;
    if (!lawyer) return null; // A subscription Consta's Checkout didn't create.
    if (PENDING_STATUSES.has(subscription.status)) return null;
    return {
      lawyer: LawyerId(lawyer),
      billingCustomer: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
      paying: event.type !== "customer.subscription.deleted" && PAYING_STATUSES.has(subscription.status),
      at: new Date(event.created * 1000),
    };
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
