import { describe, expect, it } from "vitest";
import { CaseFileId } from "../../shared";
import type { LawyerId } from "../../shared";
import type { UnitOfWork } from "../unit-of-work";

export type MeteringRepositorySetup = () => Promise<{
  uow: UnitOfWork;
  newLawyer: () => Promise<LawyerId>;
  /** Seeds a quota charge at a given moment, which insertCharge can't choose. */
  addCharge: (lawyer: LawyerId, pages: number, createdAt: Date) => Promise<void>;
}>;

/** The cases every MeteringRepository adapter passes: the in-memory fake and Drizzle. */
export function meteringRepositoryContract(setup: MeteringRepositorySetup) {
  describe("MeteringRepository contract", () => {
    it("finds no plan for a lawyer who has none", async () => {
      const { uow, newLawyer } = await setup();
      const lawyer = await newLawyer();

      expect(await uow.run((repos) => repos.metering.findPlan(lawyer))).toBeNull();
    });

    it("keeps the first plan when a second one is inserted", async () => {
      const { uow, newLawyer } = await setup();
      const lawyer = await newLawyer();

      await uow.run(async ({ metering }) => {
        await metering.insertPlanIfMissing(lawyer, { plan: "pro", pageQuota: 5_000 });
        await metering.insertPlanIfMissing(lawyer, { plan: "trial", pageQuota: 500 });
      });

      expect(await uow.run((repos) => repos.metering.findPlan(lawyer))).toEqual({ plan: "pro", pageQuota: 5_000 });
    });

    it("sums the lawyer's charges at or after a moment, and no one else's", async () => {
      const { uow, newLawyer, addCharge } = await setup();
      const [lawyer, other] = [await newLawyer(), await newLawyer()];
      const since = new Date("2026-09-01T03:00:00Z");
      await addCharge(lawyer, 120, new Date("2026-09-01T03:00:00Z"));
      await addCharge(lawyer, 30, new Date("2026-09-20T12:00:00Z"));
      await addCharge(lawyer, 400, new Date("2026-09-01T02:59:59Z"));
      await addCharge(other, 70, new Date("2026-09-20T12:00:00Z"));

      expect(await uow.run((repos) => repos.metering.pagesChargedSince(lawyer, since))).toBe(150);
    });

    it("sums no pages for a lawyer without charges", async () => {
      const { uow, newLawyer } = await setup();
      const lawyer = await newLawyer();

      expect(await uow.run((repos) => repos.metering.pagesChargedSince(lawyer, new Date(0)))).toBe(0);
    });

    it("locks and returns the lawyer's plan, or null when they have none", async () => {
      const { uow, newLawyer } = await setup();
      const [lawyer, other] = [await newLawyer(), await newLawyer()];
      await uow.run((repos) => repos.metering.insertPlanIfMissing(lawyer, { plan: "trial", pageQuota: 500 }));

      expect(await uow.run((repos) => repos.metering.lockPlan(lawyer))).toEqual({ plan: "trial", pageQuota: 500 });
      expect(await uow.run((repos) => repos.metering.lockPlan(other))).toBeNull();
    });

    it("stores one charge per case file and ignores a second one", async () => {
      const { uow, newLawyer } = await setup();
      const lawyer = await newLawyer();
      const caseFileId = CaseFileId(crypto.randomUUID());

      await uow.run(async ({ metering }) => {
        await metering.insertCharge({ lawyer, caseFileId, pages: 120 });
        await metering.insertCharge({ lawyer, caseFileId, pages: 120 });
      });

      expect(await uow.run((repos) => repos.metering.pagesChargedSince(lawyer, new Date(0)))).toBe(120);
    });

    it("tells whether a case file is charged", async () => {
      const { uow, newLawyer } = await setup();
      const lawyer = await newLawyer();
      const [charged, notCharged] = [CaseFileId(crypto.randomUUID()), CaseFileId(crypto.randomUUID())];

      await uow.run((repos) => repos.metering.insertCharge({ lawyer, caseFileId: charged, pages: 3 }));

      expect(await uow.run((repos) => repos.metering.isCharged(charged))).toBe(true);
      expect(await uow.run((repos) => repos.metering.isCharged(notCharged))).toBe(false);
    });
  });
}
