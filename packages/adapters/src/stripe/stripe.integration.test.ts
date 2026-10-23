import { CaseFileId, InvalidWebhook, LawyerId, Metering, Plans } from "@consta/core";
import { DrizzleUnitOfWork } from "@consta/core/db";
import { createTestDb, insertLawyer } from "@consta/core/testing";
import { describe, expect, it } from "vitest";
import { StripeBilling } from "./index";
import { OfflineStripe, recorded } from "./testing";
import type { RecordedWebhook } from "./testing";

/** Plans on Postgres and an offline Stripe, for a lawyer on Trial who has opened Checkout. */
async function setup() {
  const db = await createTestDb();
  const uow = new DrizzleUnitOfWork(db);
  const metering = new Metering({ uow });
  const stripe = new OfflineStripe();
  const plans = new Plans({ uow, billing: stripe.billing, metering });
  const lawyer = await insertLawyer(db, crypto.randomUUID());
  await metering.startTrial(lawyer);
  await plans.checkoutUrl(lawyer, "ana@example.com", "http://localhost:3000/plano");
  /** Each event happens in Stripe, and its webhook arrives. */
  const happen = async (...names: RecordedWebhook[]) => {
    for (const name of names) {
      stripe.happens(name);
      await plans.receiveWebhook(...recorded(name));
    }
  };
  /** Webhooks arrive for events that already happened, in this order. */
  const arrive = async (...names: RecordedWebhook[]) => {
    for (const name of names) await plans.receiveWebhook(...recorded(name));
  };
  return { stripe, plans, metering, lawyer, happen, arrive };
}

describe("Stripe webhooks on Postgres", () => {
  it("moves a lawyer to Pro and its page quota when they start paying", async () => {
    const { plans, metering, lawyer, happen } = await setup();

    await happen("subscription-created");

    expect(await plans.view(lawyer)).toMatchObject({ plan: "pro", pageQuota: 5_000, managesBilling: true });
    await metering.chargePages(lawyer, CaseFileId(crypto.randomUUID()), 4_000);
  });

  it("keeps Pro while a cancelled plan runs to the end of its period, and while a card is retried", async () => {
    const { plans, lawyer, happen } = await setup();

    await happen("subscription-created", "subscription-cancel-at-period-end", "subscription-past-due");

    expect((await plans.view(lawyer)).plan).toBe("pro");
  });

  it("moves a lawyer back to Trial when their Pro ends", async () => {
    const { plans, lawyer, happen } = await setup();

    await happen("subscription-created", "subscription-deleted");

    expect(await plans.view(lawyer)).toMatchObject({ plan: "trial", pageQuota: 500, managesBilling: true });
  });

  it("moves a lawyer back to Trial when Stripe gives up on their card", async () => {
    const { plans, lawyer, happen } = await setup();

    await happen("subscription-created", "subscription-past-due", "subscription-unpaid");

    expect((await plans.view(lawyer)).plan).toBe("trial");
  });

  it("keeps a lawyer on Trial while their first payment waits for the card", async () => {
    const { plans, lawyer, happen } = await setup();

    await happen("subscription-incomplete");

    expect((await plans.view(lawyer)).plan).toBe("trial");
  });

  it("is idempotent: the same event received twice changes the plan once", async () => {
    const { plans, lawyer, happen, arrive } = await setup();

    await happen("subscription-created", "subscription-deleted");
    await arrive("subscription-deleted");

    expect((await plans.view(lawyer)).plan).toBe("trial");
  });

  it("ends on what Stripe says now when events arrive out of order: a late 'active' can't undo a cancellation", async () => {
    const { stripe, plans, lawyer, arrive } = await setup();
    stripe.happens("subscription-created").happens("subscription-deleted");

    await arrive("subscription-deleted", "subscription-created");

    expect((await plans.view(lawyer)).plan).toBe("trial");
  });

  it("keeps Pro when one of a lawyer's two subscriptions ends and the other still bills", async () => {
    const { plans, lawyer, happen } = await setup();

    await happen("subscription-created", "second-subscription-created", "subscription-deleted");

    expect((await plans.view(lawyer)).plan).toBe("pro");
  });

  it("changes no plan for a completed checkout", async () => {
    const { plans, lawyer, arrive } = await setup();

    await arrive("checkout-session-completed");

    expect((await plans.view(lawyer)).plan).toBe("trial");
  });

  it("sends a lawyer who has paid to the billing portal, not to a second Checkout, before the webhook arrives", async () => {
    const { stripe, plans, lawyer } = await setup();
    stripe.happens("subscription-created");

    const url = await plans.checkoutUrl(lawyer, "ana@example.com", "http://localhost:3000/plano");

    expect(url).toMatch(/^https:\/\/billing\.stripe\.com\//);
  });

  it("refuses a webhook whose signature doesn't verify, and changes nothing", async () => {
    const { stripe, plans, lawyer } = await setup();
    const [payload] = recorded("subscription-created");
    stripe.happens("subscription-created");

    await expect(plans.receiveWebhook(payload, "t=1792152003,v1=forged")).rejects.toBeInstanceOf(InvalidWebhook);
    expect((await plans.view(lawyer)).plan).toBe("trial");
  });
});

const secretKey = process.env.STRIPE_SECRET_KEY;
const proPriceId = process.env.STRIPE_PRO_PRICE_ID;

describe.skipIf(!secretKey || !proPriceId)("StripeBilling against Stripe's test mode", () => {
  it("creates a customer, opens a Checkout session for Pro, and finds the customer not paying yet", async () => {
    const billing = new StripeBilling({ secretKey: secretKey!, webhookSecret: "unused", proPriceId: proPriceId! });
    const lawyer = LawyerId(crypto.randomUUID());

    const billingCustomer = await billing.createCustomer({ lawyer, email: "ana@example.com" });
    const url = await billing.checkoutUrl({ lawyer, billingCustomer, returnUrl: "http://localhost:3000/plano" });

    expect(url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    expect(await billing.isPaying(billingCustomer)).toBe(false);
  });
});
