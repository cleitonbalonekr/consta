import type { UnitOfWork, Usage } from "../ports";
import { QuotaExceeded } from "../shared";
import type { CaseFileId, LawyerId, Plan } from "../shared";

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
  /** Pages charged to the lawyer at or after `since`. */
  pagesChargedSince(lawyer: LawyerId, since: Date): Promise<number>;
  isCharged(caseFileId: CaseFileId): Promise<boolean>;
  /** Stores a charge. A second charge for the same case file is ignored. */
  insertCharge(charge: QuotaCharge): Promise<void>;
  /** Removes the case file's charge, if there is one. */
  deleteCharge(caseFileId: CaseFileId): Promise<void>;
  /** Stores one row per provider call. */
  insertUsage(lawyer: LawyerId, caseFileId: CaseFileId | null, usage: Usage[]): Promise<void>;
}

export type LawyerPlan = { plan: Plan; pageQuota: number };

export type QuotaCharge = { lawyer: LawyerId; caseFileId: CaseFileId; pages: number };

export type MeteringDeps = { uow: UnitOfWork; now?: () => Date };

/** prd-mvp.md, Monetization: a Trial covers one case file of up to 500 pages. */
const TRIAL_PAGE_QUOTA = 500;

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
    await this.uow.run((repos) => repos.metering.insertPlanIfMissing(lawyer, { plan: "trial", pageQuota: TRIAL_PAGE_QUOTA }));
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

  /** A case file whose ingestion failed gives its pages back. Idempotent. */
  async givePagesBack(caseFileId: CaseFileId): Promise<void> {
    await this.uow.run((repos) => repos.metering.deleteCharge(caseFileId));
  }

  private async left(metering: MeteringRepository, lawyer: LawyerId, plan: LawyerPlan | null) {
    if (!plan) return 0;
    return plan.pageQuota - (await metering.pagesChargedSince(lawyer, startOfMonthInSaoPaulo(this.now())));
  }
}

const SAO_PAULO = "America/Sao_Paulo";

/** Lawyers are in Brazil, so the monthly quota renews at midnight in São Paulo. */
function startOfMonthInSaoPaulo(moment: Date): Date {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: SAO_PAULO, year: "numeric", month: "numeric" }).formatToParts(moment);
  const part = (type: "year" | "month") => Number(parts.find((p) => p.type === type)!.value);
  const midnightAsUtc = Date.UTC(part("year"), part("month") - 1, 1);
  return new Date(midnightAsUtc - offsetMs(midnightAsUtc));
}

/** São Paulo's offset from UTC at a moment, e.g. -3 hours as -10_800_000. */
function offsetMs(moment: number) {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: SAO_PAULO, timeZoneName: "longOffset" })
    .formatToParts(moment)
    .find((p) => p.type === "timeZoneName")!.value; // "GMT-03:00"
  const [, sign, hours, minutes] = /GMT([+-])(\d{2}):(\d{2})/.exec(name)!;
  return (sign === "-" ? -1 : 1) * (Number(hours) * 60 + Number(minutes)) * 60_000;
}
