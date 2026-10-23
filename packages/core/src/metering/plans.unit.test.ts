import { describe, expect, it } from "vitest";
import type { PlanChange } from "../ports";
import { FakeBilling, InMemoryUnitOfWork } from "../ports/fakes";
import { CaseFileId, InvalidWebhook, LawyerId, NotFound } from "../shared";
import { Metering, Plans } from "./index";

async function setup() {
  const uow = new InMemoryUnitOfWork();
  const billing = new FakeBilling();
  const metering = new Metering({ uow, now: () => new Date("2026-10-15T12:00:00Z") });
  const plans = new Plans({ uow, billing, metering });
  const lawyer = LawyerId(crypto.randomUUID());
  await metering.startTrial(lawyer);
  const change = (paying: boolean, at: string): PlanChange => ({ lawyer, billingCustomer: "cus_ana", paying, at: new Date(at) });
  const receive = (planChange: PlanChange) => plans.receiveWebhook(...billing.sign(planChange));
  return { uow, billing, metering, plans, lawyer, change, receive };
}

describe("Plans.receiveWebhook", () => {
  it("moves a lawyer who starts paying to Pro, with the Pro page quota", async () => {
    const { plans, metering, lawyer, change, receive } = await setup();

    await receive(change(true, "2026-10-15T12:00:00Z"));

    expect(await plans.view(lawyer)).toEqual({ plan: "pro", pageQuota: 5_000, pagesLeft: 5_000, managesBilling: true, pro: null });
    await metering.chargePages(lawyer, CaseFileId(crypto.randomUUID()), 3_000);
    expect(await metering.pagesLeft(lawyer)).toBe(2_000);
  });

  it("moves a lawyer who stops paying back to Trial and its page quota", async () => {
    const { plans, lawyer, change, receive } = await setup();
    await receive(change(true, "2026-10-15T12:00:00Z"));

    await receive(change(false, "2026-10-16T12:00:00Z"));

    expect(await plans.view(lawyer)).toEqual({ plan: "trial", pageQuota: 500, pagesLeft: 500, managesBilling: true, pro: { pageQuota: 5_000 } });
  });

  it("applies the same event twice with the same result", async () => {
    const { plans, lawyer, change, receive } = await setup();
    const paying = change(true, "2026-10-15T12:00:00Z");

    await receive(paying);
    await receive(paying);

    expect((await plans.view(lawyer)).plan).toBe("pro");
  });

  it("ignores a change older than the one already applied, since events can arrive out of order", async () => {
    const { plans, lawyer, change, receive } = await setup();
    await receive(change(false, "2026-10-16T12:00:00Z"));

    await receive(change(true, "2026-10-15T12:00:00Z"));

    expect((await plans.view(lawyer)).plan).toBe("trial");
  });

  it("leaves an Enterprise plan, which is set by contract, as it is", async () => {
    const { uow, plans, lawyer, change, receive } = await setup();
    uow.state.metering.plans.set(lawyer, { plan: "enterprise", pageQuota: 50_000 });

    await receive(change(false, "2026-10-15T12:00:00Z"));

    expect(await plans.view(lawyer)).toMatchObject({ plan: "enterprise", pageQuota: 50_000 });
  });

  it("refuses a webhook whose signature doesn't match, and changes nothing", async () => {
    const { plans, billing, lawyer, change } = await setup();
    const [payload] = billing.sign(change(true, "2026-10-15T12:00:00Z"));

    await expect(plans.receiveWebhook(payload, "forged")).rejects.toBeInstanceOf(InvalidWebhook);
    expect((await plans.view(lawyer)).plan).toBe("trial");
  });

  it("does nothing for an event that changes no plan", async () => {
    const { plans, billing, lawyer } = await setup();

    await plans.receiveWebhook(...billing.sign(null));

    expect((await plans.view(lawyer)).plan).toBe("trial");
  });
});

describe("Plans.checkoutUrl", () => {
  it("sends a lawyer on Trial to Checkout, returning to the given page", async () => {
    const { plans, billing, lawyer } = await setup();

    const url = await plans.checkoutUrl(lawyer, "ana@example.com", "https://consta.test/plano");

    expect(url).toMatch(/^https:\/\//);
    expect(billing.checkouts).toEqual([{ lawyer, email: "ana@example.com", billingCustomer: null, returnUrl: "https://consta.test/plano" }]);
  });

  it("reuses the billing customer of a lawyer who paid before", async () => {
    const { plans, billing, lawyer, change, receive } = await setup();
    await receive(change(false, "2026-10-15T12:00:00Z"));

    await plans.checkoutUrl(lawyer, "ana@example.com", "https://consta.test/plano");

    expect(billing.checkouts[0]?.billingCustomer).toBe("cus_ana");
  });

  it("sends a lawyer already on Pro to the billing portal instead, so they can't pay twice", async () => {
    const { plans, billing, lawyer, change, receive } = await setup();
    await receive(change(true, "2026-10-15T12:00:00Z"));

    await plans.checkoutUrl(lawyer, "ana@example.com", "https://consta.test/plano");

    expect(billing.checkouts).toEqual([]);
    expect(billing.portals).toEqual([{ billingCustomer: "cus_ana", returnUrl: "https://consta.test/plano" }]);
  });
});

describe("Plans.portalUrl", () => {
  it("sends a lawyer who has paid to the billing portal", async () => {
    const { plans, billing, lawyer, change, receive } = await setup();
    await receive(change(true, "2026-10-15T12:00:00Z"));

    const url = await plans.portalUrl(lawyer, "https://consta.test/plano");

    expect(url).toMatch(/^https:\/\//);
    expect(billing.portals).toEqual([{ billingCustomer: "cus_ana", returnUrl: "https://consta.test/plano" }]);
  });

  it("refuses a lawyer who has never paid", async () => {
    const { plans, lawyer } = await setup();

    await expect(plans.portalUrl(lawyer, "https://consta.test/plano")).rejects.toBeInstanceOf(NotFound);
  });
});

describe("Plans.view", () => {
  it("shows a new lawyer's Trial, without billing to manage", async () => {
    const { plans, lawyer } = await setup();

    expect(await plans.view(lawyer)).toEqual({ plan: "trial", pageQuota: 500, pagesLeft: 500, managesBilling: false, pro: { pageQuota: 5_000 } });
  });

  it("refuses a lawyer without a plan", async () => {
    const { plans } = await setup();

    await expect(plans.view(LawyerId(crypto.randomUUID()))).rejects.toBeInstanceOf(NotFound);
  });
});
