import { billingContract } from "@consta/core/contracts";
import { LawyerId } from "@consta/core";
import { describe, expect, it } from "vitest";
import { offlineStripeBilling, recorded, RECORDED_LAWYER, signed } from "./testing";

describe("StripeBilling webhooks", () => {
  billingContract(async () => ({
    billing: offlineStripeBilling(),
    sign: async (change) => {
      const subscription = change && {
        id: "sub_contract",
        object: "subscription",
        customer: change.billingCustomer,
        metadata: { lawyerId: change.lawyer },
        status: change.paying ? "active" : "canceled",
      };
      const event = {
        id: "evt_contract",
        object: "event",
        created: change ? change.at.getTime() / 1000 : 1792152000,
        type: change ? "customer.subscription.updated" : "invoice.paid",
        data: { object: subscription ?? { id: "in_contract", object: "invoice" } },
      };
      return signed(JSON.stringify(event));
    },
  }));

  const lawyer = LawyerId(RECORDED_LAWYER);
  const change = (paying: boolean, at: number) => ({ lawyer, billingCustomer: "cus_TqLawyerAna01", paying, at: new Date(at * 1000) });

  it("reads each recorded subscription event as the plan change it reports", async () => {
    const billing = offlineStripeBilling();

    expect(await billing.readWebhook(...recorded("subscription-created"))).toEqual(change(true, 1792152003));
    expect(await billing.readWebhook(...recorded("subscription-cancel-at-period-end"))).toEqual(change(true, 1792500000));
    expect(await billing.readWebhook(...recorded("subscription-past-due"))).toEqual(change(true, 1794830500));
    expect(await billing.readWebhook(...recorded("subscription-unpaid"))).toEqual(change(false, 1795700000));
    expect(await billing.readWebhook(...recorded("subscription-deleted"))).toEqual(change(false, 1794830401));
  });

  it("reads no change from a subscription still waiting for its first payment", async () => {
    expect(await offlineStripeBilling().readWebhook(...recorded("subscription-incomplete"))).toBeNull();
  });

  it("reads no change from a completed checkout, which the subscription events already report", async () => {
    expect(await offlineStripeBilling().readWebhook(...recorded("checkout-session-completed"))).toBeNull();
  });

  it("reads no change from a subscription that Consta's checkout didn't create", async () => {
    expect(await offlineStripeBilling().readWebhook(...recorded("subscription-created-elsewhere"))).toBeNull();
  });
});
