import { describe, expect, it } from "vitest";
import { schema } from "../db";
import { createTestDb, insertLawyer } from "../db/testing";
import { createMetering } from "./index";

async function setup() {
  const db = await createTestDb();
  return { db, metering: createMetering({ db }) };
}

describe("Metering.pagesLeft", () => {
  it("gives a lawyer who just started the Trial the whole Trial page quota", async () => {
    const { db, metering } = await setup();
    const lawyer = await insertLawyer(db);

    await metering.startTrial(lawyer);

    expect(await metering.pagesLeft(lawyer)).toBe(500);
  });

  it("subtracts the pages charged this month, but not those charged before it", async () => {
    const { db, metering } = await setup();
    const lawyer = await insertLawyer(db);
    await metering.startTrial(lawyer);
    const beforeThisMonth = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);

    await db.insert(schema.quotaCharge).values([
      { lawyerId: lawyer, pages: 120 },
      { lawyerId: lawyer, pages: 30 },
      { lawyerId: lawyer, pages: 400, createdAt: beforeThisMonth },
    ]);

    expect(await metering.pagesLeft(lawyer)).toBe(350);
  });

  it("leaves no pages to a lawyer without a plan", async () => {
    const { db, metering } = await setup();
    const lawyer = await insertLawyer(db);

    expect(await metering.pagesLeft(lawyer)).toBe(0);
  });
});

describe("Metering.startTrial", () => {
  it("stores the Trial plan with its page quota", async () => {
    const { db, metering } = await setup();
    const lawyer = await insertLawyer(db);

    await metering.startTrial(lawyer);

    const { lawyerId, plan, pageQuota } = schema.lawyerPlan;
    expect(await db.select({ lawyerId, plan, pageQuota }).from(schema.lawyerPlan)).toEqual([{ lawyerId: lawyer, plan: "trial", pageQuota: 500 }]);
  });

  it("keeps the plan a lawyer already has", async () => {
    const { db, metering } = await setup();
    const lawyer = await insertLawyer(db);
    await db.insert(schema.lawyerPlan).values({ lawyerId: lawyer, plan: "pro", pageQuota: 5_000 });

    await metering.startTrial(lawyer);

    expect(await metering.pagesLeft(lawyer)).toBe(5_000);
  });
});
