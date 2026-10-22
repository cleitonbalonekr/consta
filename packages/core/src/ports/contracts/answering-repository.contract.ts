import { describe, expect, it } from "vitest";
import type { RankedPassages, Statement } from "../../answering";
import { CaseFile, FileSize, PageCount } from "../../case-files";
import type { PageRecord, PassageRecord } from "../../ingestion";
import { CaseFileId, QuestionId } from "../../shared";
import type { LawyerId } from "../../shared";
import type { UnitOfWork } from "../unit-of-work";

export type AnsweringRepositorySetup = () => Promise<{
  uow: UnitOfWork;
  newLawyer: () => Promise<LawyerId>;
  /** The stored questions of the case file. No repository method reads them yet. */
  questions: (caseFileId: CaseFileId) => Promise<Array<{ text: string; scope: string; answer: Statement[]; dropped: number }>>;
}>;

/** The dimensions of the passage column in the schema. */
const DIMENSIONS = 1024;

/** A unit vector from weights on the first axes. */
function vector(...weights: number[]) {
  const length = Math.hypot(...weights);
  return Array.from({ length: DIMENSIONS }, (_, i) => (weights[i] ?? 0) / length);
}

const box = (line: number) => ({ x0: 0.1, y0: 0.1 * line, x1: 0.9, y1: 0.1 * line + 0.02 });

/** Page n has folha n + 1 and three lines; its passage holds the last two. */
function pageWith(number: number, text: string): PageRecord {
  const blocks = [`Cabeçalho da página ${number}`, text, "Assinatura"].map((line, i) => ({ text: line, box: box(i + 1) }));
  return { number, folha: String(number + 1), source: "digital", text: blocks.map((block) => block.text).join("\n"), blocks };
}

function passageOn(page: number, text: string, embedding: number[]): PassageRecord {
  return { page, text: `${text}\nAssinatura`, embedding, embeddingModel: "fake-embedder", blockIndexes: [1, 2] };
}

const SENTENCA = "A sentença julgou procedente o pedido de indenização.";
const LAUDO = "O laudo pericial avaliou o imóvel.";
const PROCURACAO = "Procuração ad judicia et extra.";

/** The cases every AnsweringRepository adapter passes: the in-memory fake and Drizzle. */
export function answeringRepositoryContract(setup: AnsweringRepositorySetup) {
  describe("AnsweringRepository contract", () => {
    async function withCaseFile(context?: Awaited<ReturnType<AnsweringRepositorySetup>>) {
      const shared = context ?? (await setup());
      const id = CaseFileId(crypto.randomUUID());
      const lawyer = await shared.newLawyer();
      const caseFile = CaseFile.start({
        id,
        lawyer,
        name: "Autos.pdf",
        storageKey: `case-files/${id}.pdf`,
        uploadId: "upload-1",
        size: FileSize.from(2_048),
        pages: PageCount.from(3),
        createdAt: new Date(),
      });
      await shared.uow.run((repos) => repos.caseFiles.save(caseFile));
      return { ...shared, caseFileId: id, lawyer };
    }

    async function withPassages() {
      const context = await withCaseFile();
      const pages = [pageWith(1, SENTENCA), pageWith(2, LAUDO), pageWith(3, PROCURACAO)];
      const passages = [passageOn(1, SENTENCA, vector(1)), passageOn(2, LAUDO, vector(0, 1)), passageOn(3, PROCURACAO, vector(0, 0, 1))];
      await context.uow.run((repos) => repos.ingestion.savePages(context.caseFileId, pages, passages));
      return context;
    }

    it("gives the status of the lawyer's own case file, and null for another lawyer's or a missing one", async () => {
      const { uow, caseFileId, lawyer, newLawyer } = await withCaseFile();
      const other = await newLawyer();

      expect(await uow.run((repos) => repos.answering.caseFileStatus(lawyer, caseFileId))).toBe("uploading");
      expect(await uow.run((repos) => repos.answering.caseFileStatus(other, caseFileId))).toBeNull();
      expect(await uow.run((repos) => repos.answering.caseFileStatus(lawyer, CaseFileId(crypto.randomUUID())))).toBeNull();
    });

    const pages = (ranked: RankedPassages) => ({ byVector: ranked.byVector.map((passage) => passage.page), byText: ranked.byText.map((passage) => passage.page) });

    it("ranks the passages by distance to the embedding, and the ones that match a word of the text by how well", async () => {
      const { uow, caseFileId } = await withPassages();
      // The vector is nearest the sentença, then the laudo; the words match only the laudo.
      const query = { text: "Qual o valor do laudo pericial?", embedding: vector(0.9, 0.3, 0.1) };

      const ranked = await uow.run((repos) => repos.answering.search(caseFileId, query, 50));

      expect(pages(ranked)).toEqual({ byVector: [1, 2, 3], byText: [2] });
    });

    it("takes at most `depth` passages for each ranking", async () => {
      const { uow, caseFileId } = await withPassages();

      const ranked = await uow.run((repos) => repos.answering.search(caseFileId, { text: "laudo pericial sentença", embedding: vector(1) }, 1));

      expect(pages(ranked)).toEqual({ byVector: [1], byText: [expect.any(Number)] });
    });

    it("returns each passage with its page, folha, text and the boxes of its blocks", async () => {
      const { uow, caseFileId } = await withPassages();

      const { byVector, byText } = await uow.run((repos) => repos.answering.search(caseFileId, { text: "laudo", embedding: vector(0, 1) }, 50));

      const laudo = { id: expect.any(String), page: 2, folha: "3", text: `${LAUDO}\nAssinatura`, boxes: [box(2), box(3)] };
      expect(byVector[0]).toEqual(laudo);
      expect(byText).toEqual([{ ...laudo, id: byVector[0]!.id }]);
    });

    it("never returns another case file's passages", async () => {
      const mine = await withPassages();
      const other = await withCaseFile(mine);
      await other.uow.run((repos) => repos.ingestion.savePages(other.caseFileId, [pageWith(1, LAUDO)], [passageOn(1, LAUDO, vector(0, 1))]));

      const ranked = await other.uow.run((repos) => repos.answering.search(other.caseFileId, { text: "sentença", embedding: vector(1) }, 50));

      expect(pages(ranked)).toEqual({ byVector: [1], byText: [] });
    });

    it("saves a question with its answer and the count of dropped statements", async () => {
      const { uow, caseFileId, lawyer, questions } = await withCaseFile();
      const answer: Statement[] = [{ text: "O pedido foi julgado procedente.", citations: [{ page: 1, folha: "2", quote: SENTENCA, boxes: [box(2)] }] }];

      await uow.run((repos) =>
        repos.answering.saveQuestion({ id: QuestionId(crypto.randomUUID()), caseFileId, lawyer, scope: "whole-file", text: "O que decidiu?", answer, dropped: 1 }),
      );

      expect(await questions(caseFileId)).toEqual([{ text: "O que decidiu?", scope: "whole-file", answer, dropped: 1 }]);
    });
  });
}
