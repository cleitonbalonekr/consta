import { describe, expect, it } from "vitest";
import { InvalidWebhook } from "../../shared";
import type { Billing, BillingChange } from "../billing";

export type BillingSetup = () => Promise<{
  billing: Billing;
  /** A webhook as the adapter's provider sends it: a payload reporting `change` (null: an event about no plan) and its signature. */
  sign: (change: BillingChange | null) => Promise<[payload: string, signature: string]>;
}>;

const change: BillingChange = { billingCustomer: "cus_contract" };

/** The webhook cases every Billing adapter passes: the fake, and Stripe without a network. */
export function billingContract(setup: BillingSetup) {
  describe("Billing contract", () => {
    it("reads the customer a signed webhook reports", async () => {
      const { billing, sign } = await setup();

      expect(await billing.readWebhook(...(await sign(change)))).toEqual(change);
    });

    it("reads no change from an event about no plan", async () => {
      const { billing, sign } = await setup();

      expect(await billing.readWebhook(...(await sign(null)))).toBeNull();
    });

    it("refuses a payload changed after it was signed", async () => {
      const { billing, sign } = await setup();
      const [payload, signature] = await sign(change);

      await expect(billing.readWebhook(payload.replace("cus_contract", "cus_forged"), signature)).rejects.toBeInstanceOf(InvalidWebhook);
    });

    it("refuses a webhook without a valid signature", async () => {
      const { billing, sign } = await setup();
      const [payload] = await sign(change);

      await expect(billing.readWebhook(payload, "")).rejects.toBeInstanceOf(InvalidWebhook);
      await expect(billing.readWebhook(payload, "t=1,v1=forged")).rejects.toBeInstanceOf(InvalidWebhook);
    });
  });
}
