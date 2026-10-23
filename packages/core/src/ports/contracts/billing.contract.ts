import { describe, expect, it } from "vitest";
import { InvalidWebhook, LawyerId } from "../../shared";
import type { Billing, PlanChange } from "../billing";

export type BillingSetup = () => Promise<{
  billing: Billing;
  /** A webhook as the adapter's provider sends it: a payload reporting `change` (null: an event that changes no plan) and its signature. */
  sign: (change: PlanChange | null) => Promise<[payload: string, signature: string]>;
}>;

const change = (paying: boolean): PlanChange => ({
  lawyer: LawyerId("8d3c5e0a-6f1b-4c2e-9a7d-2b4f6e8a1c3d"),
  billingCustomer: "cus_contract",
  paying,
  at: new Date("2026-10-15T12:00:00Z"),
});

/** The webhook cases every Billing adapter passes: the fake, and Stripe without a network. */
export function billingContract(setup: BillingSetup) {
  describe("Billing contract", () => {
    it("reads the plan change a signed webhook reports", async () => {
      const { billing, sign } = await setup();

      expect(await billing.readWebhook(...(await sign(change(true))))).toEqual(change(true));
      expect(await billing.readWebhook(...(await sign(change(false))))).toEqual(change(false));
    });

    it("reads no change from an event that changes no plan", async () => {
      const { billing, sign } = await setup();

      expect(await billing.readWebhook(...(await sign(null)))).toBeNull();
    });

    it("refuses a payload changed after it was signed", async () => {
      const { billing, sign } = await setup();
      const [payload, signature] = await sign(change(false));

      await expect(billing.readWebhook(payload.replace("cus_contract", "cus_forged"), signature)).rejects.toBeInstanceOf(InvalidWebhook);
    });

    it("refuses a webhook without a valid signature", async () => {
      const { billing, sign } = await setup();
      const [payload] = await sign(change(true));

      await expect(billing.readWebhook(payload, "")).rejects.toBeInstanceOf(InvalidWebhook);
      await expect(billing.readWebhook(payload, "t=1,v1=forged")).rejects.toBeInstanceOf(InvalidWebhook);
    });
  });
}
