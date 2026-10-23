import type { Billing, UnitOfWork } from "../ports";
import { NotFound, NotOnTrial } from "../shared";
import type { LawyerId, Plan } from "../shared";
import type { Metering } from "./index";
import { PAGE_QUOTAS } from "./page-quotas";

export type PlansDeps = { uow: UnitOfWork; billing: Billing; metering: Metering };

/**
 * A lawyer's plan for their own screens. `managesBilling`: they have opened Checkout, so the
 * billing portal has their card and invoices. `pro`: what Pro offers a lawyer on Trial; null for anyone else.
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

  /** A lawyer without a plan starts the Trial. */
  async view(lawyer: LawyerId): Promise<PlanView> {
    const { plan, pageQuota, pagesLeft, billingCustomer } = await this.metering.account(lawyer);
    return { plan, pageQuota, pagesLeft, managesBilling: billingCustomer !== null, pro: plan === "trial" ? { pageQuota: PAGE_QUOTAS.pro } : null };
  }

  /**
   * Where a lawyer on Trial pays for Pro. A lawyer who already pays, even before the webhook
   * arrives, gets the billing portal instead, so no one pays for Pro twice. Throws NotOnTrial
   * for a lawyer on a plan set outside Checkout, and NotFound for one without a plan.
   */
  async checkoutUrl(lawyer: LawyerId, email: string, returnUrl: string): Promise<string> {
    // The plan stays locked while the provider is asked, so two Checkouts at once share one customer.
    return this.uow.run(async ({ metering }) => {
      const current = await metering.lockPlan(lawyer);
      if (!current) throw new NotFound(`Lawyer ${lawyer} has no plan.`);
      const existing = await metering.billingCustomer(lawyer);
      if (existing && (current.plan !== "trial" || (await this.billing.isPaying(existing)))) {
        return this.billing.portalUrl({ billingCustomer: existing, returnUrl });
      }
      if (current.plan !== "trial") throw new NotOnTrial(`Lawyer ${lawyer} is on ${current.plan}, set outside Checkout.`);
      const billingCustomer = existing ?? (await this.billing.createCustomer({ lawyer, email }));
      if (!existing) await metering.setBillingCustomer(lawyer, billingCustomer);
      return this.billing.checkoutUrl({ lawyer, billingCustomer, returnUrl });
    });
  }

  /** Where a lawyer who has opened Checkout changes their card or cancels. Throws NotFound for one who never has. */
  async portalUrl(lawyer: LawyerId, returnUrl: string): Promise<string> {
    const billingCustomer = await this.uow.run(({ metering }) => metering.billingCustomer(lawyer));
    if (!billingCustomer) throw new NotFound(`Lawyer ${lawyer} has never opened Checkout.`);
    return this.billing.portalUrl({ billingCustomer, returnUrl });
  }

  /**
   * Applies a payment provider webhook: a lawyer who pays now is on Pro, one who doesn't is
   * on Trial, each with its page quota. The plan is read again from the provider rather than
   * from the event, so repeated, late or same-second events, and a lawyer's second
   * subscription, all end on what the provider says now. Throws InvalidWebhook when the signature doesn't match.
   */
  async receiveWebhook(payload: string, signature: string): Promise<void> {
    const change = await this.billing.readWebhook(payload, signature);
    if (!change) return;
    await this.uow.run(async ({ metering }) => {
      const lawyer = await metering.lawyerOfBillingCustomer(change.billingCustomer);
      if (!lawyer) return; // A customer Consta's Checkout didn't create.
      // Locked while the provider is asked, so the later of two webhooks writes the newer answer.
      // Enterprise is set by contract, outside the provider.
      if ((await metering.lockPlan(lawyer))?.plan === "enterprise") return;
      const plan = (await this.billing.isPaying(change.billingCustomer)) ? "pro" : "trial";
      await metering.changePlan(lawyer, { plan, pageQuota: PAGE_QUOTAS[plan] });
    });
  }
}
