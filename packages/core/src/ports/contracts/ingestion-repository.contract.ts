import { describe, expect, it } from "vitest";
import { CaseFile, FileSize, PageCount } from "../../case-files";
import type { PageRecord, PassageRecord } from "../../ingestion";
import { CaseFileId, PageRange } from "../../shared";
import type { LawyerId } from "../../shared";
import type { UnitOfWork } from "../unit-of-work";

export type IngestionRepositorySetup = () => Promise<{
  uow: UnitOfWork;
  newLawyer: () => Promise<LawyerId>;
  /** The page of every stored passage of the case file, in order. No repository method reads passages yet. */
  passagePages: (caseFileId: CaseFileId) => Promise<number[]>;
}>;

/** The dimensions of the passage column in the schema. */
const DIMENSIONS = 1024;

function digitalPage(number: number): PageRecord {
  const box = { x0: 0.1, y0: 0.1, x1: 0.9, y1: 0.12 };
  return { number, folha: String(number + 1), source: "digital", text: `Página ${number}`, blocks: [{ text: `Página ${number}`, box }] };
}

function scannedPage(number: number): PageRecord {
  return { number, folha: null, source: "scanned", text: "", blocks: [] };
}

function passageOn(page: number): PassageRecord {
  const embedding = Array.from({ length: DIMENSIONS }, (_, i) => (i === page ? 1 : 0));
  return { page, text: `Página ${page}`, embedding, embeddingModel: "fake-embedder", blockIndexes: [0] };
}

/** The cases every IngestionRepository adapter passes: the in-memory fake and Drizzle. */
export function ingestionRepositoryContract(setup: IngestionRepositorySetup) {
  describe("IngestionRepository contract", () => {
    async function withCaseFile() {
      const context = await setup();
      const id = CaseFileId(crypto.randomUUID());
      const caseFile = CaseFile.start({
        id,
        lawyer: await context.newLawyer(),
        name: "Autos.pdf",
        storageKey: `case-files/${id}.pdf`,
        uploadId: "upload-1",
        size: FileSize.from(2_048),
        pages: PageCount.from(250),
        createdAt: new Date(),
      });
      await context.uow.run((repos) => repos.caseFiles.save(caseFile));
      return { ...context, caseFileId: id };
    }

    it("records the ranges of a plan once, and counts those not done", async () => {
      const { uow, caseFileId } = await withCaseFile();
      const ranges = [PageRange.from(1, 100), PageRange.from(101, 200), PageRange.from(201, 250)];

      await uow.run((repos) => repos.ingestion.addRanges(caseFileId, ranges));
      await uow.run((repos) => repos.ingestion.addRanges(caseFileId, ranges));
      await uow.run(async ({ ingestion }) => {
        await ingestion.startRange(caseFileId, ranges[0]!);
        await ingestion.finishRange(caseFileId, ranges[0]!);
        await ingestion.startRange(caseFileId, ranges[1]!);
      });

      expect(await uow.run((repos) => repos.ingestion.countUnfinishedRanges(caseFileId))).toBe(2);
    });

    it("saves pages with their passages, counts the pages and lists the scanned ones in order", async () => {
      const { uow, caseFileId, passagePages } = await withCaseFile();

      await uow.run((repos) => repos.ingestion.savePages(caseFileId, [digitalPage(1), scannedPage(4), scannedPage(2)], [passageOn(1)]));

      expect(await uow.run((repos) => repos.ingestion.countPages(caseFileId))).toBe(3);
      expect(await uow.run((repos) => repos.ingestion.scannedPages(caseFileId))).toEqual([2, 4]);
      expect(await passagePages(caseFileId)).toEqual([1]);
    });

    it("refuses to save a page twice", async () => {
      const { uow, caseFileId } = await withCaseFile();
      await uow.run((repos) => repos.ingestion.savePages(caseFileId, [digitalPage(1)], []));

      await expect(uow.run((repos) => repos.ingestion.savePages(caseFileId, [digitalPage(1)], []))).rejects.toThrow();
    });

    it("removes the pages of a range with their passages, and keeps every other page", async () => {
      const { uow, caseFileId, passagePages } = await withCaseFile();
      const other = await withCaseFile();
      await uow.run((repos) =>
        repos.ingestion.savePages(caseFileId, [digitalPage(100), digitalPage(101), digitalPage(200), digitalPage(201)], [100, 101, 200, 201].map(passageOn)),
      );
      await other.uow.run((repos) => repos.ingestion.savePages(other.caseFileId, [digitalPage(150)], [passageOn(150)]));

      await uow.run((repos) => repos.ingestion.removePages(caseFileId, PageRange.from(101, 200)));

      expect(await uow.run((repos) => repos.ingestion.countPages(caseFileId))).toBe(2);
      expect(await passagePages(caseFileId)).toEqual([100, 201]);
      expect(await other.passagePages(other.caseFileId)).toEqual([150]);
    });
  });
}
