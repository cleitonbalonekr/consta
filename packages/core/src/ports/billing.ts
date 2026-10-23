import type { LawyerId } from "../shared";

/**
 * A webhook saying a billing customer's paid plan may have changed. It carries no plan:
 * events arrive out of order and in the same second, so the plan is read again with `isPaying`.
 */
export type BillingChange = { billingCustomer: string };

/** The payment provider's customers, its hosted pages for Pro, and the webhook that reports changes. */
export interface Billing {
  /** A new customer for the lawyer, before their first Checkout, so every later page and event names it. */
  createCustomer(input: { lawyer: LawyerId; email: string }): Promise<string>;
  /**
   * A hosted checkout page where the customer starts paying for Pro, which comes back to
   * `returnUrl`. Closes the customer's other open checkout pages, so they can pay only once.
   */
  checkoutUrl(input: { lawyer: LawyerId; billingCustomer: string; returnUrl: string }): Promise<string>;
  /** A hosted page where a customer changes their card or cancels, which comes back to `returnUrl`. */
  portalUrl(input: { billingCustomer: string; returnUrl: string }): Promise<string>;
  /** Whether the customer pays for Pro now, read from the provider. */
  isPaying(billingCustomer: string): Promise<boolean>;
  /**
   * Verifies a webhook's signature and reads it: the customer whose plan may have changed,
   * or null for an event about no plan. Throws InvalidWebhook when the signature doesn't match.
   */
  readWebhook(payload: string, signature: string): Promise<BillingChange | null>;
}
