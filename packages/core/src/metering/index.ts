import { and, eq, gte, sql, sum } from "drizzle-orm";
import { schema } from "../db";
import type { Db } from "../db";
import type { Usage } from "../ports";
import { NotImplemented } from "../shared";
import type { CaseFileId, LawyerId } from "../shared";

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

export type MeteringDeps = { db: Db };

/** prd-mvp.md, Monetization: a Trial covers one case file of up to 500 pages. */
const TRIAL_PAGE_QUOTA = 500;

// Lawyers are in Brazil, so the monthly quota renews at midnight in São Paulo.
const startOfThisMonth = sql`date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'`;

export function createMetering({ db }: MeteringDeps): Metering {
  const pagesChargedThisMonth = async (lawyer: LawyerId) => {
    const [row] = await db
      .select({ pages: sum(schema.quotaCharge.pages).mapWith(Number) })
      .from(schema.quotaCharge)
      .where(and(eq(schema.quotaCharge.lawyerId, lawyer), gte(schema.quotaCharge.createdAt, startOfThisMonth)));
    return row?.pages ?? 0;
  };

  return {
    async record() {
      throw new NotImplemented("Metering.record");
    },
    async startTrial(lawyer) {
      await db.insert(schema.lawyerPlan).values({ lawyerId: lawyer, plan: "trial", pageQuota: TRIAL_PAGE_QUOTA }).onConflictDoNothing();
    },
    async pagesLeft(lawyer) {
      const [plan] = await db
        .select({ pageQuota: schema.lawyerPlan.pageQuota })
        .from(schema.lawyerPlan)
        .where(eq(schema.lawyerPlan.lawyerId, lawyer));
      if (!plan) return 0;
      return plan.pageQuota - (await pagesChargedThisMonth(lawyer));
    },
    async chargePages() {
      throw new NotImplemented("Metering.chargePages");
    },
  };
}
