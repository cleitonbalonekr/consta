import { describe, expect, it } from "vitest";
import { InMemoryUnitOfWork } from "../ports/fakes";
import { LawyerId } from "../shared";
import { createMetering } from "./index";

function setup(now = new Date("2026-10-15T12:00:00Z")) {
  const uow = new InMemoryUnitOfWork();
  const lawyer = LawyerId(crypto.randomUUID());
  const charge = (pages: number, createdAt: string) => uow.state.metering.charges.push({ lawyer, pages, createdAt: new Date(createdAt) });
  return { uow, lawyer, charge, metering: createMetering({ uow, now: () => now }) };
}

describe("Metering.pagesLeft", () => {
  it("gives a lawyer who just started the Trial the whole Trial page quota", async () => {
    const { metering, lawyer } = setup();

    await metering.startTrial(lawyer);

    expect(await metering.pagesLeft(lawyer)).toBe(500);
  });

  it("subtracts the pages charged this month, but not those charged before it", async () => {
    const { metering, lawyer, charge } = setup();
    await metering.startTrial(lawyer);
    charge(120, "2026-10-02T10:00:00Z");
    charge(30, "2026-10-14T10:00:00Z");
    charge(400, "2026-09-05T10:00:00Z");

    expect(await metering.pagesLeft(lawyer)).toBe(350);
  });

  it("starts the month at midnight in São Paulo, not in UTC", async () => {
    // 02:00 UTC on 1 October is still 23:00 on 30 September in São Paulo.
    const { metering, lawyer, charge } = setup(new Date("2026-10-01T02:00:00Z"));
    await metering.startTrial(lawyer);
    charge(100, "2026-09-01T03:00:00Z"); // 00:00 on 1 September in São Paulo
    charge(200, "2026-09-01T02:59:00Z"); // 23:59 on 31 August in São Paulo

    expect(await metering.pagesLeft(lawyer)).toBe(400);
  });

  it("leaves no pages to a lawyer without a plan", async () => {
    const { metering, lawyer } = setup();

    expect(await metering.pagesLeft(lawyer)).toBe(0);
  });
});

describe("Metering.startTrial", () => {
  it("stores the Trial plan with its page quota", async () => {
    const { metering, lawyer, uow } = setup();

    await metering.startTrial(lawyer);

    expect(await uow.run((repos) => repos.metering.findPlan(lawyer))).toEqual({ plan: "trial", pageQuota: 500 });
  });

  it("keeps the plan a lawyer already has", async () => {
    const { metering, lawyer, uow } = setup();
    await uow.run((repos) => repos.metering.insertPlanIfMissing(lawyer, { plan: "pro", pageQuota: 5_000 }));

    await metering.startTrial(lawyer);

    expect(await metering.pagesLeft(lawyer)).toBe(5_000);
  });
});
