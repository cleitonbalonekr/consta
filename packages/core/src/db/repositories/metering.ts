import { and, eq, gte, sum } from "drizzle-orm";
import type { LawyerPlan, MeteringRepository, QuotaCharge } from "../../metering";
import type { CaseFileId, LawyerId } from "../../shared";
import type { Db } from "../index";
import * as schema from "../schema";

const planColumns = { plan: schema.lawyerPlan.plan, pageQuota: schema.lawyerPlan.pageQuota };

export class DrizzleMeteringRepository implements MeteringRepository {
  constructor(private readonly db: Db) {}

  async findPlan(lawyer: LawyerId) {
    const [row] = await this.db.select(planColumns).from(schema.lawyerPlan).where(eq(schema.lawyerPlan.lawyerId, lawyer));
    return row ?? null;
  }

  async lockPlan(lawyer: LawyerId) {
    const [row] = await this.db
      .select(planColumns)
      .from(schema.lawyerPlan)
      .where(eq(schema.lawyerPlan.lawyerId, lawyer))
      .for("update");
    return row ?? null;
  }

  async insertPlanIfMissing(lawyer: LawyerId, { plan, pageQuota }: LawyerPlan) {
    await this.db.insert(schema.lawyerPlan).values({ lawyerId: lawyer, plan, pageQuota }).onConflictDoNothing();
  }

  async pagesChargedSince(lawyer: LawyerId, since: Date) {
    const [row] = await this.db
      .select({ pages: sum(schema.quotaCharge.pages).mapWith(Number) })
      .from(schema.quotaCharge)
      .where(and(eq(schema.quotaCharge.lawyerId, lawyer), gte(schema.quotaCharge.createdAt, since)));
    return row?.pages ?? 0;
  }

  async isCharged(caseFileId: CaseFileId) {
    const [row] = await this.db
      .select({ id: schema.quotaCharge.id })
      .from(schema.quotaCharge)
      .where(eq(schema.quotaCharge.caseFileId, caseFileId))
      .limit(1);
    return row !== undefined;
  }

  async insertCharge({ lawyer, caseFileId, pages }: QuotaCharge) {
    await this.db
      .insert(schema.quotaCharge)
      .values({ lawyerId: lawyer, caseFileId, pages })
      .onConflictDoNothing({ target: schema.quotaCharge.caseFileId });
  }
}
