import type { Billing, UnitOfWork } from "../ports";
import { NotFound } from "../shared";
import type { LawyerId, Plan } from "../shared";
import type { Metering } from "./index";
import { PAGE_QUOTAS } from "./page-quotas";

export type PlansDeps = { uow: UnitOfWork; billing: Billing; metering: Metering };

/**
 * A lawyer's plan for their own screens. `managesBilling`: they have paid before, so the billing
 * portal has their card and invoices. `pro`: what Pro offers a lawyer on Trial; null for anyone else.
 */
export type PlanView = { plan: Plan; pageQuota: number; pagesLeft: number; managesBilling: boolean; pro: { pageQuota: number } | null };

/**
 * The part of Metering's interface for paying: a lawyer moves from Trial to Pro through
 * the payment provider's checkout, and its webhook keeps their plan and page quota in sync.
 */
export class Plans {
  private readonly uow: UnitOfWork;
  private readonly billing: Billing;
  private readonly metering: Metering;

  constructor({ uow, billing, metering }: PlansDeps) {
    this.uow = uow;
    this.billing = billing;
    this.metering = metering;
  }

  /** Throws NotFound for a lawyer without a plan. */
  async view(lawyer: LawyerId): Promise<PlanView> {
    const { plan, billingCustomer } = await this.account(lawyer);
    return {
      ...plan,
      pagesLeft: await this.metering.pagesLeft(lawyer),
      managesBilling: billingCustomer !== null,
      pro: plan.plan === "trial" ? { pageQuota: PAGE_QUOTAS.pro } : null,
    };
  }

  /**
   * Where a lawyer on Trial pays for Pro. A lawyer already on another plan gets the
   * billing portal instead, so no one pays for Pro twice. Throws NotFound without a plan.
   */
  async checkoutUrl(lawyer: LawyerId, email: string, returnUrl: string): Promise<string> {
    const { plan, billingCustomer } = await this.account(lawyer);
    if (plan.plan !== "trial" && billingCustomer) return this.billing.portalUrl({ billingCustomer, returnUrl });
    return this.billing.checkoutUrl({ lawyer, email, billingCustomer, returnUrl });
  }

  /** Where a lawyer who has paid changes their card or cancels. Throws NotFound for one who never paid. */
  async portalUrl(lawyer: LawyerId, returnUrl: string): Promise<string> {
    const billingCustomer = await this.uow.run(({ metering }) => metering.billingCustomer(lawyer));
    if (!billingCustomer) throw new NotFound(`Lawyer ${lawyer} has never paid.`);
    return this.billing.portalUrl({ billingCustomer, returnUrl });
  }

  /**
   * Applies a payment provider webhook: a paying lawyer is on Pro, one who stopped paying
   * is back on Trial, each with its page quota. Safe to receive again, and in any order.
   * Throws InvalidWebhook when the signature doesn't match.
   */
  async receiveWebhook(payload: string, signature: string): Promise<void> {
    const change = await this.billing.readWebhook(payload, signature);
    if (!change) return;
    const plan = change.paying ? "pro" : "trial";
    await this.uow.run(async ({ metering }) => {
      // Enterprise is set by contract, outside Stripe.
      if ((await metering.lockPlan(change.lawyer))?.plan === "enterprise") return;
      await metering.changePlan(change.lawyer, { plan, pageQuota: PAGE_QUOTAS[plan] }, { billingCustomer: change.billingCustomer, at: change.at });
    });
  }

  /** Throws NotFound for a lawyer without a plan. */
  private account(lawyer: LawyerId) {
    return this.uow.run(async ({ metering }) => {
      const plan = await metering.findPlan(lawyer);
      if (!plan) throw new NotFound(`Lawyer ${lawyer} has no plan.`);
      return { plan, billingCustomer: await metering.billingCustomer(lawyer) };
    });
  }
}
