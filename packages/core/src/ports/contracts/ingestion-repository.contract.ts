import { describe, expect, it } from "vitest";
import { CaseFile, FileSize, PageCount } from "../../case-files";
import type { PageRecord, PassageRecord } from "../../ingestion";
import { CaseFileId, PageRange } from "../../shared";
import type { LawyerId } from "../../shared";
import type { FactDraft, PecaDraft } from "../map-extractor";
import type { UnitOfWork } from "../unit-of-work";

export type IngestionRepositorySetup = () => Promise<{
  uow: UnitOfWork;
  newLawyer: () => Promise<LawyerId>;
  /** The page of every stored passage of the case file, in order. No repository method reads passages yet. */
  passagePages: (caseFileId: CaseFileId) => Promise<number[]>;
  /** The stored facts of the case file, in page order. No repository method reads facts yet. */
  facts: (caseFileId: CaseFileId) => Promise<FactDraft[]>;
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

function peca(firstPage: number, lastPage: number): PecaDraft {
  return { type: "sentenca", title: `Sentença ${firstPage}`, date: "2026-05-04", firstPage, lastPage, summary: "Julgou procedente." };
}

function fact(page: number): FactDraft {
  return { kind: "amount", value: "R$ 10.000,00", normalizedValue: "10000.00", context: `condenação na página ${page}`, page };
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

    it("reads the length of each page's text, and the text of the pages of a range, in page order", async () => {
      const { uow, caseFileId } = await withCaseFile();
      await uow.run((repos) => repos.ingestion.savePages(caseFileId, [digitalPage(3), scannedPage(2), digitalPage(1)], []));

      expect(await uow.run((repos) => repos.ingestion.pageLengths(caseFileId))).toEqual([
        { page: 1, chars: "Página 1".length },
        { page: 2, chars: 0 },
        { page: 3, chars: "Página 3".length },
      ]);
      expect(await uow.run((repos) => repos.ingestion.pageTexts(caseFileId, PageRange.from(2, 3)))).toEqual([
        { page: 2, text: "" },
        { page: 3, text: "Página 3" },
      ]);
    });

    it("replaces the document map and facts of the case file, and keeps those of every other", async () => {
      const { uow, caseFileId, facts } = await withCaseFile();
      const other = await withCaseFile();
      await uow.run((repos) => repos.ingestion.savePages(caseFileId, [digitalPage(1), digitalPage(2), digitalPage(3)], []));
      await other.uow.run((repos) => repos.ingestion.savePages(other.caseFileId, [digitalPage(1)], []));
      await other.uow.run((repos) => repos.ingestion.replaceDocumentMap(other.caseFileId, [peca(1, 1)], [fact(1)]));
      await uow.run((repos) => repos.ingestion.replaceDocumentMap(caseFileId, [peca(1, 3)], [fact(1)]));

      await uow.run((repos) => repos.ingestion.replaceDocumentMap(caseFileId, [peca(3, 3), peca(1, 2)], [fact(3), fact(2)]));

      const documentMap = await uow.run((repos) => repos.caseFiles.documentMapOf(caseFileId));
      expect(documentMap).toEqual([
        { id: expect.any(String), ...peca(1, 2) },
        { id: expect.any(String), ...peca(3, 3) },
      ]);
      expect(await facts(caseFileId)).toEqual([fact(2), fact(3)]);
      expect(await other.uow.run((repos) => repos.caseFiles.documentMapOf(other.caseFileId))).toHaveLength(1);
      expect(await other.facts(other.caseFileId)).toEqual([fact(1)]);
    });

    it("refuses a fact on a page that is not stored", async () => {
      const { uow, caseFileId } = await withCaseFile();
      await uow.run((repos) => repos.ingestion.savePages(caseFileId, [digitalPage(1)], []));

      await expect(uow.run((repos) => repos.ingestion.replaceDocumentMap(caseFileId, [peca(1, 1)], [fact(2)]))).rejects.toThrow();
    });
  });
}
