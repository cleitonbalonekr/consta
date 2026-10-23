import { and, eq, gte, lt, sum } from "drizzle-orm";
import type { LawyerPlan, MeteringRepository, QuotaCharge } from "../../metering";
import type { Usage } from "../../ports";
import { CaseFileId, LawyerId } from "../../shared";
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

  async changePlan(lawyer: LawyerId, { plan, pageQuota }: LawyerPlan) {
    await this.db.update(schema.lawyerPlan).set({ plan, pageQuota }).where(eq(schema.lawyerPlan.lawyerId, lawyer));
  }

  async billingCustomer(lawyer: LawyerId) {
    const [row] = await this.db
      .select({ billingCustomer: schema.lawyerPlan.billingCustomer })
      .from(schema.lawyerPlan)
      .where(eq(schema.lawyerPlan.lawyerId, lawyer));
    return row?.billingCustomer ?? null;
  }

  async setBillingCustomer(lawyer: LawyerId, billingCustomer: string) {
    await this.db.update(schema.lawyerPlan).set({ billingCustomer }).where(eq(schema.lawyerPlan.lawyerId, lawyer));
  }

  async lawyerOfBillingCustomer(billingCustomer: string) {
    const [row] = await this.db
      .select({ lawyerId: schema.lawyerPlan.lawyerId })
      .from(schema.lawyerPlan)
      .where(eq(schema.lawyerPlan.billingCustomer, billingCustomer));
    return row ? LawyerId(row.lawyerId) : null;
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

  async deleteCharge(caseFileId: CaseFileId) {
    await this.db.delete(schema.quotaCharge).where(eq(schema.quotaCharge.caseFileId, caseFileId));
  }

  async insertUsage(lawyer: LawyerId, caseFileId: CaseFileId | null, usage: Usage[]) {
    await this.db.insert(schema.usageEvent).values(
      usage.map(({ costUsd, ...event }) => ({ ...event, lawyerId: lawyer, caseFileId, costUsd: String(costUsd) })),
    );
  }

  async costsBetween(since: Date, until: Date) {
    const { usageEvent, user, caseFile } = schema;
    const rows = await this.db
      .select({
        lawyer: usageEvent.lawyerId,
        email: user.email,
        caseFileId: usageEvent.caseFileId,
        caseFileName: caseFile.name,
        kind: usageEvent.kind,
        costUsd: sum(usageEvent.costUsd).mapWith(Number),
      })
      .from(usageEvent)
      .leftJoin(user, eq(user.id, usageEvent.lawyerId))
      .leftJoin(caseFile, eq(caseFile.id, usageEvent.caseFileId))
      .where(and(gte(usageEvent.createdAt, since), lt(usageEvent.createdAt, until)))
      .groupBy(usageEvent.lawyerId, user.email, usageEvent.caseFileId, caseFile.name, usageEvent.kind);
    return rows.map((row) => ({
      ...row,
      lawyer: LawyerId(row.lawyer),
      // usage_event has no foreign key to the lawyer, so a deleted lawyer's costs stay, without an email.
      email: row.email ?? "",
      caseFileId: row.caseFileId === null ? null : CaseFileId(row.caseFileId),
    }));
  }
}
