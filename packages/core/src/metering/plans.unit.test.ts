import { describe, expect, it } from "vitest";
import { FakeBilling, InMemoryUnitOfWork } from "../ports/fakes";
import { CaseFileId, InvalidWebhook, LawyerId, NotFound, NotOnTrial } from "../shared";
import { Metering, Plans } from "./index";

const RETURN_URL = "https://consta.test/plano";

async function setup() {
  const uow = new InMemoryUnitOfWork();
  const billing = new FakeBilling();
  const metering = new Metering({ uow, now: () => new Date("2026-10-15T12:00:00Z") });
  const plans = new Plans({ uow, billing, metering });
  const lawyer = LawyerId(crypto.randomUUID());
  await metering.startTrial(lawyer);
  /** The lawyer opens Checkout, which gives them a billing customer. */
  const openCheckout = async () => {
    await plans.checkoutUrl(lawyer, "ana@example.com", RETURN_URL);
    return (await uow.run(({ metering }) => metering.billingCustomer(lawyer)))!;
  };
  /** The provider now says the customer pays, or doesn't, and sends a webhook. */
  const providerSays = async (billingCustomer: string, paying: boolean) => {
    if (paying) billing.paying.add(billingCustomer);
    else billing.paying.delete(billingCustomer);
    await plans.receiveWebhook(...billing.sign({ billingCustomer }));
  };
  return { uow, billing, metering, plans, lawyer, openCheckout, providerSays };
}

describe("Plans.receiveWebhook", () => {
  it("moves a lawyer who pays to Pro, with the Pro page quota", async () => {
    const { plans, metering, lawyer, openCheckout, providerSays } = await setup();
    const customer = await openCheckout();

    await providerSays(customer, true);

    expect(await plans.view(lawyer)).toEqual({ plan: "pro", pageQuota: 5_000, pagesLeft: 5_000, managesBilling: true, pro: null });
    await metering.chargePages(lawyer, CaseFileId(crypto.randomUUID()), 3_000);
    expect(await metering.pagesLeft(lawyer)).toBe(2_000);
  });

  it("moves a lawyer who stops paying back to Trial and its page quota", async () => {
    const { plans, lawyer, openCheckout, providerSays } = await setup();
    const customer = await openCheckout();
    await providerSays(customer, true);

    await providerSays(customer, false);

    expect(await plans.view(lawyer)).toEqual({ plan: "trial", pageQuota: 500, pagesLeft: 500, managesBilling: true, pro: { pageQuota: 5_000 } });
  });

  it("applies what the provider says now, whatever the event's order: a late event can't undo a cancellation", async () => {
    const { billing, plans, lawyer, openCheckout, providerSays } = await setup();
    const customer = await openCheckout();
    await providerSays(customer, true);
    const [lateEvent, signature] = billing.sign({ billingCustomer: customer });
    await providerSays(customer, false);

    await plans.receiveWebhook(lateEvent, signature);

    expect((await plans.view(lawyer)).plan).toBe("trial");
  });

  it("applies the same event twice with the same result", async () => {
    const { billing, plans, lawyer, openCheckout } = await setup();
    const customer = await openCheckout();
    billing.paying.add(customer);
    const event = billing.sign({ billingCustomer: customer });

    await plans.receiveWebhook(...event);
    await plans.receiveWebhook(...event);

    expect((await plans.view(lawyer)).plan).toBe("pro");
  });

  it("leaves an Enterprise plan, which is set by contract, as it is", async () => {
    const { uow, plans, lawyer, openCheckout, providerSays } = await setup();
    const customer = await openCheckout();
    uow.state.metering.plans.set(lawyer, { plan: "enterprise", pageQuota: 50_000 });

    await providerSays(customer, false);

    expect(await plans.view(lawyer)).toMatchObject({ plan: "enterprise", pageQuota: 50_000 });
  });

  it("changes no plan for a customer Consta didn't create", async () => {
    const { plans, lawyer, providerSays } = await setup();

    await providerSays("cus_elsewhere", true);

    expect((await plans.view(lawyer)).plan).toBe("trial");
  });

  it("refuses a webhook whose signature doesn't match, and changes nothing", async () => {
    const { plans, billing, lawyer, openCheckout } = await setup();
    const customer = await openCheckout();
    billing.paying.add(customer);
    const [payload] = billing.sign({ billingCustomer: customer });

    await expect(plans.receiveWebhook(payload, "forged")).rejects.toBeInstanceOf(InvalidWebhook);
    expect((await plans.view(lawyer)).plan).toBe("trial");
  });

  it("does nothing for an event about no plan", async () => {
    const { plans, billing, lawyer } = await setup();

    await plans.receiveWebhook(...billing.sign(null));

    expect((await plans.view(lawyer)).plan).toBe("trial");
  });
});

describe("Plans.checkoutUrl", () => {
  it("gives a lawyer on Trial a billing customer and sends them to Checkout, returning to the given page", async () => {
    const { uow, plans, billing, lawyer } = await setup();

    const url = await plans.checkoutUrl(lawyer, "ana@example.com", RETURN_URL);

    expect(url).toMatch(/^https:\/\//);
    expect(billing.customers).toEqual([{ lawyer, email: "ana@example.com" }]);
    expect(billing.checkouts).toEqual([{ lawyer, billingCustomer: "cus_fake_1", returnUrl: RETURN_URL }]);
    expect(await uow.run(({ metering }) => metering.billingCustomer(lawyer))).toBe("cus_fake_1");
  });

  it("keeps the billing customer of a lawyer who opened Checkout before", async () => {
    const { plans, billing, lawyer, openCheckout } = await setup();
    await openCheckout();

    await plans.checkoutUrl(lawyer, "ana@example.com", RETURN_URL);

    expect(billing.customers).toHaveLength(1);
    expect(billing.checkouts.map((checkout) => checkout.billingCustomer)).toEqual(["cus_fake_1", "cus_fake_1"]);
  });

  it("sends a lawyer who pays to the billing portal before the webhook arrives, so they can't pay twice", async () => {
    const { plans, billing, lawyer, openCheckout } = await setup();
    const customer = await openCheckout();
    billing.paying.add(customer);

    await plans.checkoutUrl(lawyer, "ana@example.com", RETURN_URL);

    expect(billing.checkouts).toHaveLength(1);
    expect(billing.portals).toEqual([{ billingCustomer: customer, returnUrl: RETURN_URL }]);
  });

  it("sends a lawyer on Pro to the billing portal", async () => {
    const { plans, billing, lawyer, openCheckout, providerSays } = await setup();
    const customer = await openCheckout();
    await providerSays(customer, true);

    await plans.checkoutUrl(lawyer, "ana@example.com", RETURN_URL);

    expect(billing.portals).toEqual([{ billingCustomer: customer, returnUrl: RETURN_URL }]);
  });

  it("refuses a lawyer on a plan set outside Checkout, and opens no Checkout", async () => {
    const { uow, plans, billing, lawyer } = await setup();
    uow.state.metering.plans.set(lawyer, { plan: "enterprise", pageQuota: 50_000 });

    await expect(plans.checkoutUrl(lawyer, "ana@example.com", RETURN_URL)).rejects.toBeInstanceOf(NotOnTrial);
    expect(billing.customers).toEqual([]);
    expect(billing.checkouts).toEqual([]);
  });
});

describe("Plans.portalUrl", () => {
  it("sends a lawyer who has opened Checkout to the billing portal", async () => {
    const { plans, billing, lawyer, openCheckout } = await setup();
    const customer = await openCheckout();

    const url = await plans.portalUrl(lawyer, RETURN_URL);

    expect(url).toMatch(/^https:\/\//);
    expect(billing.portals).toEqual([{ billingCustomer: customer, returnUrl: RETURN_URL }]);
  });

  it("refuses a lawyer who never has", async () => {
    const { plans, lawyer } = await setup();

    await expect(plans.portalUrl(lawyer, RETURN_URL)).rejects.toBeInstanceOf(NotFound);
  });
});

describe("Plans.view", () => {
  it("shows a new lawyer's Trial, without billing to manage", async () => {
    const { plans, lawyer } = await setup();

    expect(await plans.view(lawyer)).toEqual({ plan: "trial", pageQuota: 500, pagesLeft: 500, managesBilling: false, pro: { pageQuota: 5_000 } });
  });

  it("starts the Trial of a lawyer whose sign-up didn't, so they can still upload", async () => {
    const { plans, metering } = await setup();
    const lawyer = LawyerId(crypto.randomUUID());

    expect(await plans.view(lawyer)).toMatchObject({ plan: "trial", pagesLeft: 500 });
    await metering.chargePages(lawyer, CaseFileId(crypto.randomUUID()), 100);
    expect(await metering.pagesLeft(lawyer)).toBe(400);
  });
});
