import type { UnitOfWork, Usage } from "../ports";
import { NotImplemented } from "../shared";
import type { CaseFileId, LawyerId, Plan } from "../shared";

/** Records what paid providers cost and how much of a lawyer's page quota is left. */
export interface Metering {
  record(lawyer: LawyerId, caseFileId: CaseFileId | null, usage: Usage[]): Promise<void>;
  /**
   * Gives a new lawyer the Trial plan and its page quota. Called on the lawyer's
   * first sign-in; a lawyer who already has a plan keeps it.
   */
  startTrial(lawyer: LawyerId): Promise<void>;
  /**
   * Pages left this month. Pages count once ingested, even if the case file is
   * deleted later. A lawyer without a plan has none.
   */
  pagesLeft(lawyer: LawyerId): Promise<number>;
  /**
   * Checks the quota and charges a case file's pages in one transaction, so two
   * uploads can't both fit. Throws QuotaExceeded. Idempotent per case file.
   */
  chargePages(lawyer: LawyerId, caseFileId: CaseFileId, pages: number): Promise<void>;
}

/** Metering's tables, behind a port so Metering holds no SQL (ADR-0006). */
export interface MeteringRepository {
  /** The lawyer's plan, or null when they have none. */
  findPlan(lawyer: LawyerId): Promise<LawyerPlan | null>;
  /** Stores the plan unless the lawyer already has one. */
  insertPlanIfMissing(lawyer: LawyerId, plan: LawyerPlan): Promise<void>;
  /** Pages charged to the lawyer at or after `since`. */
  pagesChargedSince(lawyer: LawyerId, since: Date): Promise<number>;
}

export type LawyerPlan = { plan: Plan; pageQuota: number };

export type MeteringDeps = { uow: UnitOfWork; now?: () => Date };

/** prd-mvp.md, Monetization: a Trial covers one case file of up to 500 pages. */
const TRIAL_PAGE_QUOTA = 500;

export function createMetering({ uow, now = () => new Date() }: MeteringDeps): Metering {
  return {
    async record() {
      throw new NotImplemented("Metering.record");
    },
    async startTrial(lawyer) {
      await uow.run((repos) => repos.metering.insertPlanIfMissing(lawyer, { plan: "trial", pageQuota: TRIAL_PAGE_QUOTA }));
    },
    pagesLeft(lawyer) {
      return uow.run(async (repos) => {
        const plan = await repos.metering.findPlan(lawyer);
        if (!plan) return 0;
        return plan.pageQuota - (await repos.metering.pagesChargedSince(lawyer, startOfMonthInSaoPaulo(now())));
      });
    },
    async chargePages() {
      throw new NotImplemented("Metering.chargePages");
    },
  };
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
