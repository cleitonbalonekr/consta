import type { UnitOfWork, Usage } from "../ports";
import { QuotaExceeded } from "../shared";
import type { CaseFileId, LawyerId, Plan, UsageKind } from "../shared";
import type { CostsByKind } from "./cost-totals";
import { Month } from "./month";
import { PAGE_QUOTAS } from "./page-quotas";
import { UsageCosts } from "./usage-costs";

export { Month };
export { Plans } from "./plans";
export type { PlansDeps, PlanView } from "./plans";
export type { CostsByKind };

/** Metering's tables, behind a port so Metering holds no SQL (ADR-0006). */
export interface MeteringRepository {
  /** The lawyer's plan, or null when they have none. */
  findPlan(lawyer: LawyerId): Promise<LawyerPlan | null>;
  /**
   * Like findPlan, but the plan's row stays locked until the run ends, so two
   * charges for one lawyer happen one after the other.
   */
  lockPlan(lawyer: LawyerId): Promise<LawyerPlan | null>;
  /** Stores the plan unless the lawyer already has one. */
  insertPlanIfMissing(lawyer: LawyerId, plan: LawyerPlan): Promise<void>;
  /** Replaces the lawyer's plan. Does nothing for a lawyer without one. */
  changePlan(lawyer: LawyerId, plan: LawyerPlan): Promise<void>;
  /** The payment provider's customer of a lawyer who has opened Checkout, or null. */
  billingCustomer(lawyer: LawyerId): Promise<string | null>;
  /** Stores the lawyer's billing customer. */
  setBillingCustomer(lawyer: LawyerId, billingCustomer: string): Promise<void>;
  /** The lawyer whose billing customer this is, or null. */
  lawyerOfBillingCustomer(billingCustomer: string): Promise<LawyerId | null>;
  /** Pages charged to the lawyer at or after `since`. */
  pagesChargedSince(lawyer: LawyerId, since: Date): Promise<number>;
  isCharged(caseFileId: CaseFileId): Promise<boolean>;
  /** Stores a charge. A second charge for the same case file is ignored. */
  insertCharge(charge: QuotaCharge): Promise<void>;
  /** Removes the case file's charge, if there is one. */
  deleteCharge(caseFileId: CaseFileId): Promise<void>;
  /** Stores one row per provider call. */
  insertUsage(lawyer: LawyerId, caseFileId: CaseFileId | null, usage: Usage[]): Promise<void>;
  /** The cost of the usage at or after `since` and before `until`, summed per lawyer, case file and kind, in no order. */
  costsBetween(since: Date, until: Date): Promise<UsageCost[]>;
}

/** `caseFileId` and `caseFileName` are null for usage without a case file, or whose case file was deleted. */
export type UsageCost = {
  lawyer: LawyerId;
  email: string;
  caseFileId: CaseFileId | null;
  caseFileName: string | null;
  kind: UsageKind;
  costUsd: number;
};

/** What paid providers cost in one month, for the operator. Lawyers and case files come most expensive first. */
export type CostReport = {
  month: Month;
  total: CostsByKind;
  lawyers: Array<{
    lawyer: LawyerId;
    email: string;
    costs: CostsByKind;
    caseFiles: Array<{ caseFileId: CaseFileId | null; name: string | null; costs: CostsByKind }>;
  }>;
};

export type LawyerPlan = { plan: Plan; pageQuota: number };

/** `billingCustomer` is null until the lawyer first opens Checkout. */
export type LawyerAccount = LawyerPlan & { billingCustomer: string | null; pagesLeft: number };

const TRIAL: LawyerPlan = { plan: "trial", pageQuota: PAGE_QUOTAS.trial };

export type QuotaCharge = { lawyer: LawyerId; caseFileId: CaseFileId; pages: number };

export type MeteringDeps = { uow: UnitOfWork; now?: () => Date };

/** Records what paid providers cost and how much of a lawyer's page quota is left. */
export class Metering {
  private readonly uow: UnitOfWork;
  private readonly now: () => Date;

  constructor({ uow, now = () => new Date() }: MeteringDeps) {
    this.uow = uow;
    this.now = now;
  }

  /** Stores what paid provider calls cost. Call it after each call, outside the run that saves the result, so a rollback can't lose it. */
  async record(lawyer: LawyerId, caseFileId: CaseFileId | null, usage: Usage[]): Promise<void> {
    if (usage.length === 0) return;
    await this.uow.run((repos) => repos.metering.insertUsage(lawyer, caseFileId, usage));
  }

  /**
   * Gives a new lawyer the Trial plan and its page quota. Called on the lawyer's
   * first sign-in; a lawyer who already has a plan keeps it.
   */
  async startTrial(lawyer: LawyerId): Promise<void> {
    await this.uow.run((repos) => repos.metering.insertPlanIfMissing(lawyer, TRIAL));
  }

  /**
   * The lawyer's plan, billing customer and pages left this month, in one run. A lawyer
   * whose sign-up didn't start a Trial (the sign-up hook failed, or came before plans) starts one now.
   */
  account(lawyer: LawyerId): Promise<LawyerAccount> {
    return this.uow.run(async ({ metering }) => {
      let plan = await metering.findPlan(lawyer);
      if (!plan) {
        await metering.insertPlanIfMissing(lawyer, TRIAL);
        plan = TRIAL;
      }
      return { ...plan, billingCustomer: await metering.billingCustomer(lawyer), pagesLeft: await this.left(metering, lawyer, plan) };
    });
  }

  /**
   * Pages left this month. Pages count once ingested, even if the case file is
   * deleted later. A lawyer without a plan has none.
   */
  pagesLeft(lawyer: LawyerId): Promise<number> {
    return this.uow.run(async ({ metering }) => this.left(metering, lawyer, await metering.findPlan(lawyer)));
  }

  /**
   * Checks the quota and charges a case file's pages in one transaction, with the
   * lawyer's plan locked, so two uploads can't both fit. Throws QuotaExceeded.
   * Idempotent per case file: a second charge does nothing.
   */
  async chargePages(lawyer: LawyerId, caseFileId: CaseFileId, pages: number): Promise<void> {
    await this.uow.run(async ({ metering }) => {
      const plan = await metering.lockPlan(lawyer);
      if (await metering.isCharged(caseFileId)) return;
      const pagesLeft = await this.left(metering, lawyer, plan);
      if (pages > pagesLeft) throw new QuotaExceeded(pages, pagesLeft);
      await metering.insertCharge({ lawyer, caseFileId, pages });
    });
  }

  /** What paid providers cost in a month, per lawyer and per case file, by usage kind. */
  async costs(month: Month): Promise<CostReport> {
    const rows = await this.uow.run((repos) => repos.metering.costsBetween(month.start, month.end));
    return new UsageCosts(rows).report(month);
  }

  /** A case file whose ingestion failed gives its pages back. Idempotent. */
  async givePagesBack(caseFileId: CaseFileId): Promise<void> {
    await this.uow.run((repos) => repos.metering.deleteCharge(caseFileId));
  }

  private async left(metering: MeteringRepository, lawyer: LawyerId, plan: LawyerPlan | null) {
    if (!plan) return 0;
    return plan.pageQuota - (await metering.pagesChargedSince(lawyer, Month.of(this.now()).start));
  }
}

