import { describe, expect, it } from "vitest";
import { CaseFile, FileSize, PageCount } from "../../case-files";
import { CaseFileId } from "../../shared";
import type { LawyerId } from "../../shared";
import type { UnitOfWork } from "../unit-of-work";

export type CaseFileRepositorySetup = () => Promise<{ uow: UnitOfWork; newLawyer: () => Promise<LawyerId> }>;

function newCaseFile(lawyer: LawyerId, createdAt = new Date("2026-10-10T12:00:00Z")) {
  const id = CaseFileId(crypto.randomUUID());
  return CaseFile.start({
    id,
    lawyer,
    name: "Autos 123.pdf",
    storageKey: `case-files/${id}.pdf`,
    uploadId: "upload-1",
    size: FileSize.from(2_048),
    pages: PageCount.from(10),
    createdAt,
  });
}

/** The cases every CaseFileRepository adapter passes: the in-memory fake and Drizzle. */
export function caseFileRepositoryContract(setup: CaseFileRepositorySetup) {
  describe("CaseFileRepository contract", () => {
    it("finds a saved case file with every field it had", async () => {
      const { uow, newLawyer } = await setup();
      const caseFile = newCaseFile(await newLawyer());

      await uow.run((repos) => repos.caseFiles.save(caseFile));

      const found = await uow.run((repos) => repos.caseFiles.find(caseFile.snapshot().lawyer, caseFile.id));
      expect(found?.snapshot()).toEqual(caseFile.snapshot());
    });

    it("saves the changes to a stored case file", async () => {
      const { uow, newLawyer } = await setup();
      const lawyer = await newLawyer();
      const caseFile = newCaseFile(lawyer);
      await uow.run((repos) => repos.caseFiles.save(caseFile));

      caseFile.queue({ size: FileSize.from(4_096), pages: PageCount.from(12) });
      await uow.run((repos) => repos.caseFiles.save(caseFile));

      const found = await uow.run((repos) => repos.caseFiles.find(lawyer, caseFile.id, { lock: true }));
      expect(found?.snapshot()).toMatchObject({ status: "queued", uploadId: null, sizeBytes: 4_096, pageCount: 12 });
    });

    it("finds nothing for another lawyer, for an unknown id or for an id that is not a uuid", async () => {
      const { uow, newLawyer } = await setup();
      const [lawyer, other] = [await newLawyer(), await newLawyer()];
      const caseFile = newCaseFile(lawyer);
      await uow.run((repos) => repos.caseFiles.save(caseFile));

      for (const [who, id] of [
        [other, caseFile.id],
        [lawyer, CaseFileId(crypto.randomUUID())],
        [lawyer, CaseFileId("autos-de-exemplo")],
      ] as const) {
        expect(await uow.run((repos) => repos.caseFiles.find(who, id))).toBeNull();
      }
    });

    it("finds a case file by id alone, for any lawyer, with a lock or without one", async () => {
      const { uow, newLawyer } = await setup();
      const caseFile = newCaseFile(await newLawyer());
      await uow.run((repos) => repos.caseFiles.save(caseFile));

      expect((await uow.run((repos) => repos.caseFiles.findById(caseFile.id)))?.snapshot()).toEqual(caseFile.snapshot());
      expect((await uow.run((repos) => repos.caseFiles.findById(caseFile.id, { lock: true })))?.id).toBe(caseFile.id);
      expect(await uow.run((repos) => repos.caseFiles.findById(CaseFileId(crypto.randomUUID())))).toBeNull();
      expect(await uow.run((repos) => repos.caseFiles.findById(CaseFileId("autos-de-exemplo")))).toBeNull();
    });

    it("keeps the progress and the unread pages of a ready case file", async () => {
      const { uow, newLawyer } = await setup();
      const lawyer = await newLawyer();
      const caseFile = newCaseFile(lawyer);
      caseFile.queue({ size: FileSize.from(2_048), pages: PageCount.from(10) });
      caseFile.startProcessing();
      caseFile.recordPagesRead(10);
      caseFile.startMapping();
      caseFile.markReady(new Date("2026-10-10T13:00:00Z"), [{ first: 2, last: 3 }, { first: 7, last: 7 }]);

      await uow.run((repos) => repos.caseFiles.save(caseFile));

      const found = await uow.run((repos) => repos.caseFiles.find(lawyer, caseFile.id));
      expect(found?.snapshot()).toMatchObject({
        status: "ready",
        pagesDone: 10,
        readyAt: new Date("2026-10-10T13:00:00Z"),
        unreadPages: [{ first: 2, last: 3 }, { first: 7, last: 7 }],
      });
    });

    it("reads the folha of each page that has one, by page number, and nothing for another case file", async () => {
      const { uow, newLawyer } = await setup();
      const [caseFile, other] = [newCaseFile(await newLawyer()), newCaseFile(await newLawyer())];
      const page = (number: number, folha: string | null) => ({ number, folha, source: "digital" as const, text: "", blocks: [] });
      await uow.run(async ({ caseFiles, ingestion }) => {
        await caseFiles.save(caseFile);
        await caseFiles.save(other);
        await ingestion.savePages(caseFile.id, [page(1, "12"), page(2, null), page(3, "13-v")], []);
        await ingestion.savePages(other.id, [page(1, "99")], []);
      });

      expect(await uow.run((repos) => repos.caseFiles.folhasOf(caseFile.id))).toEqual({ 1: "12", 3: "13-v" });
      expect(await uow.run((repos) => repos.caseFiles.folhasOf(CaseFileId(crypto.randomUUID())))).toEqual({});
    });

    it("lists only the lawyer's case files, newest first", async () => {
      const { uow, newLawyer } = await setup();
      const [lawyer, other] = [await newLawyer(), await newLawyer()];
      const older = newCaseFile(lawyer, new Date("2026-10-01T12:00:00Z"));
      const newer = newCaseFile(lawyer, new Date("2026-10-02T12:00:00Z"));
      await uow.run(async ({ caseFiles }) => {
        await caseFiles.save(older);
        await caseFiles.save(newer);
        await caseFiles.save(newCaseFile(other));
      });

      const listed = await uow.run((repos) => repos.caseFiles.listOf(lawyer));

      expect(listed.map((caseFile) => caseFile.id)).toEqual([newer.id, older.id]);
    });
  });
}
