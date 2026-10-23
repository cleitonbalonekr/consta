import type { LawyerId } from "../shared";

/**
 * A lawyer's paid plan as the payment provider last reported it. `paying` is false once
 * they cancel or stop paying. `at` is when the provider made the change: events can
 * arrive out of order, so a change older than one already applied is stale.
 */
export type PlanChange = { lawyer: LawyerId; billingCustomer: string; paying: boolean; at: Date };

/** The payment provider's hosted pages for Pro, and the webhook that reports plan changes. */
export interface Billing {
  /**
   * A hosted checkout page where the lawyer starts paying for Pro, which comes back to
   * `returnUrl`. Pass the `billingCustomer` of a lawyer who paid before, so they keep it.
   */
  checkoutUrl(input: { lawyer: LawyerId; email: string; billingCustomer: string | null; returnUrl: string }): Promise<string>;
  /** A hosted page where a lawyer who has paid changes their card or cancels, which comes back to `returnUrl`. */
  portalUrl(input: { billingCustomer: string; returnUrl: string }): Promise<string>;
  /**
   * Verifies a webhook's signature and reads it: the plan change it reports, or null for
   * an event that changes no plan. Throws InvalidWebhook when the signature doesn't match.
   */
  readWebhook(payload: string, signature: string): Promise<PlanChange | null>;
}
