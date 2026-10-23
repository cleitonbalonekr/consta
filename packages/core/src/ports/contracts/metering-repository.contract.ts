import { describe, expect, it } from "vitest";
import { CaseFile, FileSize, PageCount } from "../../case-files";
import { CaseFileId } from "../../shared";
import type { LawyerId, UsageKind } from "../../shared";
import type { UnitOfWork } from "../unit-of-work";

export type MeteringRepositorySetup = () => Promise<{
  uow: UnitOfWork;
  /** A lawyer whose email is `<id>@example.com`. */
  newLawyer: () => Promise<LawyerId>;
  /** Seeds a quota charge at a given moment, which insertCharge can't choose. */
  addCharge: (lawyer: LawyerId, pages: number, createdAt: Date) => Promise<void>;
  /** Seeds a usage row at a given moment, which insertUsage can't choose. */
  addUsage: (lawyer: LawyerId, caseFileId: CaseFileId | null, kind: UsageKind, costUsd: number, createdAt: Date) => Promise<void>;
  /** Every stored usage row. */
  usageRows: () => Promise<Array<{ lawyer: LawyerId; caseFileId: CaseFileId | null; kind: string; units: number; costUsd: number }>>;
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

    it("changes a lawyer's plan", async () => {
      const { uow, newLawyer } = await setup();
      const lawyer = await newLawyer();
      await uow.run((repos) => repos.metering.insertPlanIfMissing(lawyer, { plan: "trial", pageQuota: 500 }));

      await uow.run((repos) => repos.metering.changePlan(lawyer, { plan: "pro", pageQuota: 5_000 }));

      expect(await uow.run((repos) => repos.metering.findPlan(lawyer))).toEqual({ plan: "pro", pageQuota: 5_000 });
    });

    it("changes no plan for a lawyer who has none", async () => {
      const { uow, newLawyer } = await setup();
      const lawyer = await newLawyer();

      await uow.run((repos) => repos.metering.changePlan(lawyer, { plan: "pro", pageQuota: 5_000 }));

      expect(await uow.run((repos) => repos.metering.findPlan(lawyer))).toBeNull();
    });

    it("stores a lawyer's billing customer and finds the lawyer by it", async () => {
      const { uow, newLawyer } = await setup();
      const [ana, bruno] = [await newLawyer(), await newLawyer()];
      await uow.run(async ({ metering }) => {
        await metering.insertPlanIfMissing(ana, { plan: "trial", pageQuota: 500 });
        await metering.insertPlanIfMissing(bruno, { plan: "trial", pageQuota: 500 });
      });

      await uow.run((repos) => repos.metering.setBillingCustomer(ana, "cus_ana"));

      expect(await uow.run((repos) => repos.metering.billingCustomer(ana))).toBe("cus_ana");
      expect(await uow.run((repos) => repos.metering.billingCustomer(bruno))).toBeNull();
      expect(await uow.run((repos) => repos.metering.lawyerOfBillingCustomer("cus_ana"))).toBe(ana);
      expect(await uow.run((repos) => repos.metering.lawyerOfBillingCustomer("cus_unknown"))).toBeNull();
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

    it("deletes a case file's charge and keeps the others", async () => {
      const { uow, newLawyer } = await setup();
      const lawyer = await newLawyer();
      const [failed, kept] = [CaseFileId(crypto.randomUUID()), CaseFileId(crypto.randomUUID())];
      await uow.run(async ({ metering }) => {
        await metering.insertCharge({ lawyer, caseFileId: failed, pages: 40 });
        await metering.insertCharge({ lawyer, caseFileId: kept, pages: 3 });
      });

      await uow.run((repos) => repos.metering.deleteCharge(failed));
      await uow.run((repos) => repos.metering.deleteCharge(failed));

      expect(await uow.run((repos) => repos.metering.isCharged(failed))).toBe(false);
      expect(await uow.run((repos) => repos.metering.pagesChargedSince(lawyer, new Date(0)))).toBe(3);
    });

    it("stores one usage row per provider call", async () => {
      const { uow, newLawyer, usageRows } = await setup();
      const lawyer = await newLawyer();
      const embed = { kind: "embed", provider: "voyage", model: "voyage-4-lite", units: 1_200, unit: "token", costUsd: 0.000024 } as const;

      await uow.run((repos) => repos.metering.insertUsage(lawyer, null, [embed, { ...embed, units: 50, costUsd: 0.000001 }]));

      expect(await usageRows()).toEqual([
        { lawyer, caseFileId: null, kind: "embed", units: 1_200, costUsd: 0.000024 },
        { lawyer, caseFileId: null, kind: "embed", units: 50, costUsd: 0.000001 },
      ]);
    });

    it("sums the cost of the usage in a window per lawyer, case file and kind, with the lawyer's email and the case file's name", async () => {
      const { uow, newLawyer, addUsage } = await setup();
      const [ana, bia] = [await newLawyer(), await newLawyer()];
      const id = CaseFileId(crypto.randomUUID());
      const caseFile = CaseFile.start({
        id,
        lawyer: ana,
        name: "Autos 123.pdf",
        storageKey: `case-files/${id}.pdf`,
        uploadId: "upload-1",
        size: FileSize.from(2_048),
        pages: PageCount.from(10),
        createdAt: new Date("2026-10-01T12:00:00Z"),
      });
      await uow.run((repos) => repos.caseFiles.save(caseFile));
      const [since, until] = [new Date("2026-10-01T03:00:00Z"), new Date("2026-11-01T03:00:00Z")];
      await addUsage(ana, id, "embed", 0.000024, since);
      await addUsage(ana, id, "embed", 0.000006, new Date("2026-10-15T12:00:00Z"));
      await addUsage(ana, id, "answer", 0.0125, new Date("2026-10-15T12:00:00Z"));
      await addUsage(bia, null, "answer", 0.5, new Date("2026-10-15T12:00:00Z"));
      await addUsage(ana, id, "answer", 9, new Date("2026-10-01T02:59:59Z"));
      await addUsage(ana, id, "answer", 9, until);

      const costs = await uow.run((repos) => repos.metering.costsBetween(since, until));

      const byKey = (a: { email: string; kind: string }, b: { email: string; kind: string }) => `${a.email}${a.kind}`.localeCompare(`${b.email}${b.kind}`);
      expect(costs.sort(byKey)).toEqual(
        [
          { lawyer: ana, email: `${ana}@example.com`, caseFileId: id, caseFileName: "Autos 123.pdf", kind: "answer", costUsd: 0.0125 },
          { lawyer: ana, email: `${ana}@example.com`, caseFileId: id, caseFileName: "Autos 123.pdf", kind: "embed", costUsd: 0.00003 },
          { lawyer: bia, email: `${bia}@example.com`, caseFileId: null, caseFileName: null, kind: "answer", costUsd: 0.5 },
        ].sort(byKey),
      );
    });
  });
}
