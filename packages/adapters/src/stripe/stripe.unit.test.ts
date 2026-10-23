import { billingContract } from "@consta/core/contracts";
import { LawyerId } from "@consta/core";
import { describe, expect, it } from "vitest";
import { OfflineStripe, PRO_PRICE, recorded, RECORDED_CUSTOMER, signed } from "./testing";
import type { RecordedWebhook } from "./testing";

const lawyer = LawyerId("0b7e1c52-3f4a-4d8e-9b21-6c5d8e7f9a10");

describe("StripeBilling webhooks", () => {
  billingContract(async () => ({
    billing: new OfflineStripe().billing,
    sign: async (change) => {
      const subscription = change && { id: "sub_contract", object: "subscription", customer: change.billingCustomer, status: "active" };
      const event = {
        id: "evt_contract",
        object: "event",
        created: 1792152000,
        type: change ? "customer.subscription.updated" : "invoice.paid",
        data: { object: subscription ?? { id: "in_contract", object: "invoice" } },
      };
      return signed(JSON.stringify(event));
    },
  }));

  it("reads the customer of each recorded subscription event", async () => {
    const { billing } = new OfflineStripe();
    const events: RecordedWebhook[] = [
      "subscription-created",
      "subscription-incomplete",
      "subscription-cancel-at-period-end",
      "subscription-past-due",
      "subscription-unpaid",
      "subscription-deleted",
      "second-subscription-created",
    ];

    for (const name of events) expect(await billing.readWebhook(...recorded(name))).toEqual({ billingCustomer: RECORDED_CUSTOMER });
  });

  it("reads no change from a completed checkout, which the subscription events already report", async () => {
    expect(await new OfflineStripe().billing.readWebhook(...recorded("checkout-session-completed"))).toBeNull();
  });
});

describe("StripeBilling.isPaying", () => {
  const paying = (...events: RecordedWebhook[]) => {
    const stripe = new OfflineStripe();
    for (const name of events) stripe.happens(name);
    return stripe.billing.isPaying(RECORDED_CUSTOMER);
  };

  it("counts an active subscription to Pro, also while it runs to the end of a cancelled period and while a card is retried", async () => {
    expect(await paying("subscription-created")).toBe(true);
    expect(await paying("subscription-cancel-at-period-end")).toBe(true);
    expect(await paying("subscription-past-due")).toBe(true);
  });

  it("doesn't count a subscription waiting for its first payment, given up on, or ended", async () => {
    expect(await paying()).toBe(false);
    expect(await paying("subscription-incomplete")).toBe(false);
    expect(await paying("subscription-unpaid")).toBe(false);
    expect(await paying("subscription-deleted")).toBe(false);
  });

  it("counts a second subscription when the first one ends", async () => {
    expect(await paying("second-subscription-created", "subscription-deleted")).toBe(true);
  });

  it("asks Stripe for every subscription of the customer, whatever its status", async () => {
    const stripe = new OfflineStripe();

    await stripe.billing.isPaying(RECORDED_CUSTOMER);

    expect(stripe.requests).toHaveLength(1);
    expect(stripe.requests[0]).toMatchObject({ method: "GET", path: "/v1/subscriptions" });
  });
});

describe("StripeBilling checkout", () => {
  it("creates one customer per lawyer, with a key that makes a retry return the same one", async () => {
    const stripe = new OfflineStripe();

    expect(await stripe.billing.createCustomer({ lawyer, email: "ana@example.com" })).toBe(RECORDED_CUSTOMER);
    expect(stripe.requests[0]?.body.get("email")).toBe("ana@example.com");
    expect(stripe.requests[0]?.body.get("metadata[lawyerId]")).toBe(lawyer);
  });

  it("opens a Checkout for Pro for the customer, and closes their other open Checkouts so they pay only once", async () => {
    const stripe = new OfflineStripe();
    const input = { lawyer, billingCustomer: RECORDED_CUSTOMER, returnUrl: "https://consta.test/plano" };

    await stripe.billing.checkoutUrl(input);
    const url = await stripe.billing.checkoutUrl(input);

    expect(url).toBe("https://checkout.stripe.com/c/pay/cs_test_offline_2");
    expect([...stripe.openSessions]).toEqual(["cs_test_offline_2"]);
    const created = stripe.requests.find((request) => request.method === "POST" && request.path === "/v1/checkout/sessions");
    expect(Object.fromEntries(created?.body ?? [])).toMatchObject({
      mode: "subscription",
      customer: RECORDED_CUSTOMER,
      "line_items[0][price]": PRO_PRICE,
      "subscription_data[metadata][lawyerId]": lawyer,
      success_url: "https://consta.test/plano",
    });
  });
});
