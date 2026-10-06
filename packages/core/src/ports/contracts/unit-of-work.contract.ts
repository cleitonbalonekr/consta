import { describe, expect, it } from "vitest";
import type { LawyerId } from "../../shared";
import type { UnitOfWork } from "../unit-of-work";

export type UnitOfWorkSetup = () => Promise<{ uow: UnitOfWork; newLawyer: () => Promise<LawyerId> }>;

const trial = { plan: "trial", pageQuota: 500 } as const;

class Abort extends Error {}

/** The cases every UnitOfWork adapter passes: the in-memory fake and Drizzle. */
export function unitOfWorkContract(setup: UnitOfWorkSetup) {
  describe("UnitOfWork contract", () => {
    it("commits the writes of a run that returns", async () => {
      const { uow, newLawyer } = await setup();
      const lawyer = await newLawyer();

      await uow.run((repos) => repos.metering.insertPlanIfMissing(lawyer, trial));

      expect(await uow.run((repos) => repos.metering.findPlan(lawyer))).toEqual(trial);
    });

    it("rolls back every write of a run that throws, and rethrows", async () => {
      const { uow, newLawyer } = await setup();
      const lawyer = await newLawyer();

      const run = uow.run(async (repos) => {
        await repos.metering.insertPlanIfMissing(lawyer, trial);
        throw new Abort();
      });

      await expect(run).rejects.toBeInstanceOf(Abort);
      expect(await uow.run((repos) => repos.metering.findPlan(lawyer))).toBeNull();
    });

    it("joins a run inside a run to the outer one, so the outer throw rolls back both", async () => {
      const { uow, newLawyer } = await setup();
      const lawyer = await newLawyer();

      const run = uow.run(async () => {
        await uow.run((repos) => repos.metering.insertPlanIfMissing(lawyer, trial));
        throw new Abort();
      });

      await expect(run).rejects.toBeInstanceOf(Abort);
      expect(await uow.run((repos) => repos.metering.findPlan(lawyer))).toBeNull();
    });

    it("returns what the work returns", async () => {
      const { uow } = await setup();

      expect(await uow.run(async () => 42)).toBe(42);
    });
  });
}
