import { and, eq, gte, sum } from "drizzle-orm";
import type { LawyerPlan, MeteringRepository } from "../../metering";
import type { LawyerId } from "../../shared";
import type { Db } from "../index";
import * as schema from "../schema";

export function createDrizzleMeteringRepository(db: Db): MeteringRepository {
  return {
    async findPlan(lawyer) {
      const [row] = await db
        .select({ plan: schema.lawyerPlan.plan, pageQuota: schema.lawyerPlan.pageQuota })
        .from(schema.lawyerPlan)
        .where(eq(schema.lawyerPlan.lawyerId, lawyer));
      return row ?? null;
    },
    async insertPlanIfMissing(lawyer: LawyerId, { plan, pageQuota }: LawyerPlan) {
      await db.insert(schema.lawyerPlan).values({ lawyerId: lawyer, plan, pageQuota }).onConflictDoNothing();
    },
    async pagesChargedSince(lawyer, since) {
      const [row] = await db
        .select({ pages: sum(schema.quotaCharge.pages).mapWith(Number) })
        .from(schema.quotaCharge)
        .where(and(eq(schema.quotaCharge.lawyerId, lawyer), gte(schema.quotaCharge.createdAt, since)));
      return row?.pages ?? 0;
    },
  };
}
