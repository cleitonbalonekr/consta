import { CaseFileId, InvalidWebhook, LawyerId, Metering, Plans } from "@consta/core";
import { DrizzleUnitOfWork } from "@consta/core/db";
import { createTestDb, insertLawyer } from "@consta/core/testing";
import { describe, expect, it } from "vitest";
import { StripeBilling } from "./index";
import { offlineStripeBilling, recorded, RECORDED_LAWYER } from "./testing";
import type { RecordedWebhook } from "./testing";

/** Plans on Postgres, receiving recorded Stripe webhooks for a lawyer who just started the Trial. */
async function setup() {
  const db = await createTestDb();
  const uow = new DrizzleUnitOfWork(db);
  const metering = new Metering({ uow });
  const plans = new Plans({ uow, billing: offlineStripeBilling(), metering });
  const lawyer = await insertLawyer(db, RECORDED_LAWYER);
  await metering.startTrial(lawyer);
  const receive = async (...names: RecordedWebhook[]) => {
    for (const name of names) await plans.receiveWebhook(...recorded(name));
  };
  return { plans, metering, lawyer, receive };
}

describe("Stripe webhooks on Postgres", () => {
  it("moves a lawyer to Pro and its page quota when they start paying", async () => {
    const { plans, metering, lawyer, receive } = await setup();

    await receive("subscription-created");

    expect(await plans.view(lawyer)).toMatchObject({ plan: "pro", pageQuota: 5_000, managesBilling: true });
    await metering.chargePages(lawyer, CaseFileId(crypto.randomUUID()), 4_000);
  });

  it("keeps Pro while a cancelled plan runs to the end of its period, and while a card is retried", async () => {
    const { plans, lawyer, receive } = await setup();

    await receive("subscription-created", "subscription-cancel-at-period-end", "subscription-past-due");

    expect((await plans.view(lawyer)).plan).toBe("pro");
  });

  it("moves a lawyer back to Trial when their Pro ends", async () => {
    const { plans, lawyer, receive } = await setup();

    await receive("subscription-created", "subscription-deleted");

    expect(await plans.view(lawyer)).toMatchObject({ plan: "trial", pageQuota: 500, managesBilling: true });
  });

  it("moves a lawyer back to Trial when Stripe gives up on their card", async () => {
    const { plans, lawyer, receive } = await setup();

    await receive("subscription-created", "subscription-past-due", "subscription-unpaid");

    expect((await plans.view(lawyer)).plan).toBe("trial");
  });

  it("is idempotent: the same event received twice changes the plan once", async () => {
    const { plans, lawyer, receive } = await setup();

    await receive("subscription-created", "subscription-deleted", "subscription-deleted");

    expect((await plans.view(lawyer)).plan).toBe("trial");
  });

  it("ends on Pro whichever comes first of a card confirmation and the payment, in the same second", async () => {
    for (const order of [["subscription-incomplete", "subscription-created"], ["subscription-created", "subscription-incomplete"]] as const) {
      const { plans, lawyer, receive } = await setup();

      await receive(...order);

      expect((await plans.view(lawyer)).plan).toBe("pro");
    }
  });

  it("ignores an event that arrives after a newer one", async () => {
    const { plans, lawyer, receive } = await setup();

    await receive("subscription-deleted", "subscription-created");

    expect((await plans.view(lawyer)).plan).toBe("trial");
  });

  it("changes no plan for a completed checkout or a Stripe subscription made outside Consta", async () => {
    const { plans, lawyer, receive } = await setup();

    await receive("checkout-session-completed", "subscription-created-elsewhere");

    expect(await plans.view(lawyer)).toMatchObject({ plan: "trial", managesBilling: false });
  });

  it("refuses a webhook whose signature doesn't verify, and changes nothing", async () => {
    const { plans, lawyer } = await setup();
    const [payload] = recorded("subscription-created");

    await expect(plans.receiveWebhook(payload, "t=1792152003,v1=forged")).rejects.toBeInstanceOf(InvalidWebhook);
    expect((await plans.view(lawyer)).plan).toBe("trial");
  });
});

const secretKey = process.env.STRIPE_SECRET_KEY;
const proPriceId = process.env.STRIPE_PRO_PRICE_ID;

describe.skipIf(!secretKey || !proPriceId)("StripeBilling against Stripe's test mode", () => {
  it("opens a Checkout session for Pro", async () => {
    const billing = new StripeBilling({ secretKey: secretKey!, webhookSecret: "unused", proPriceId: proPriceId! });

    const url = await billing.checkoutUrl({
      lawyer: LawyerId(RECORDED_LAWYER),
      email: "ana@example.com",
      billingCustomer: null,
      returnUrl: "http://localhost:3000/plano",
    });

    expect(url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
  });
});
