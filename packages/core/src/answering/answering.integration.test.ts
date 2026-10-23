import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { DrizzleUnitOfWork, schema } from "../db";
import { createTestDb, insertLawyer } from "../db/testing";
import { FakeCitingModel } from "../ports/fakes";
import { NotFound } from "../shared";
import type { CaseFileId } from "../shared";
import type { AnswerEvent, Statement } from "./index";
import { answeringOn, sourceOn } from "./testing";

/** Answering on Postgres, with case files ingested from fixture PDFs through the inline Jobs adapter. */
async function setup(options: Parameters<typeof answeringOn>[1] = {}) {
  const db = await createTestDb();
  const built = answeringOn(new DrizzleUnitOfWork(db), options);
  const newLawyer = async () => {
    const lawyer = await insertLawyer(db);
    await built.metering.startTrial(lawyer);
    return lawyer;
  };
  /** What a citation of the page's passage must show, read from the stored page and passage. */
  async function storedPassage(caseFileId: CaseFileId, number: number) {
    const [row] = await db
      .select({ folha: schema.page.folha, blocks: schema.page.blocks, text: schema.passage.text, blockIndexes: schema.passage.blockIndexes })
      .from(schema.passage)
      .innerJoin(schema.page, and(eq(schema.page.caseFileId, schema.passage.caseFileId), eq(schema.page.number, schema.passage.page)))
      .where(and(eq(schema.passage.caseFileId, caseFileId), eq(schema.passage.page, number)));
    return { page: number, folha: row!.folha, quote: row!.text, boxes: row!.blockIndexes.map((index) => row!.blocks[index]!.box) };
  }
  return { ...built, db, newLawyer, storedPassage, lawyer: await newLawyer() };
}

const statements = (events: AnswerEvent[]): Statement[] => events.flatMap((event) => (event.type === "statement" ? [event.statement] : []));

describe("Answering on Postgres", () => {
  it("resolves every citation to its passage's page, folha, quote and boxes", async () => {
    const model = new FakeCitingModel(({ sources }) => [
      { text: "A autora é professora.\n", sourceIds: [sourceOn(sources, 2).id] },
      { text: "O réu é um banco.", sourceIds: [sourceOn(sources, 1).id, sourceOn(sources, 3).id] },
    ]);
    const { ingest, ask, lawyer, storedPassage } = await setup({ model });
    const caseFileId = await ingest(lawyer, ["digital", "digital", "digital"]);

    const events = await ask(lawyer, caseFileId);

    expect(statements(events)).toEqual([
      { text: "A autora é professora.", citations: [await storedPassage(caseFileId, 2)] },
      { text: "O réu é um banco.", citations: [await storedPassage(caseFileId, 1), await storedPassage(caseFileId, 3)] },
    ]);
    expect((await storedPassage(caseFileId, 2)).folha).toBe("3");
  });

  it("drops the uncited statements, and saves the question with its answer, its dropped count and its usage", async () => {
    const { ingest, ask, lawyer, db } = await setup();
    const caseFileId = await ingest(lawyer, ["digital", "digital"]);

    // The default script cites two sources and adds one uncited line.
    const events = await ask(lawyer, caseFileId, "Quem é a autora?");

    expect(statements(events)).toHaveLength(2);
    expect(events.at(-1)).toMatchObject({ type: "done", dropped: 1 });
    const rows = await db.select().from(schema.question).where(eq(schema.question.caseFileId, caseFileId));
    expect(rows).toEqual([
      expect.objectContaining({
        lawyerId: lawyer,
        scope: "whole-file",
        quickAction: null,
        pecaId: null,
        text: "Quem é a autora?",
        answer: statements(events),
        droppedStatements: 1,
      }),
    ]);
    const usage = await db.select({ kind: schema.usageEvent.kind }).from(schema.usageEvent).where(eq(schema.usageEvent.caseFileId, caseFileId));
    expect(usage.map((row) => row.kind).sort()).toEqual(["answer", "embed", "embed", "extract", "rerank"]);
  });

  it("finds a passage by its words through Portuguese full-text search", async () => {
    const model = new FakeCitingModel();
    const { ingest, ask, lawyer } = await setup({ model });
    const caseFileId = await ingest(lawyer, ["two-column", "digital"]);

    await ask(lawyer, caseFileId, "O banco inscreveu o nome da autora no cadastro de inadimplentes?");

    expect(model.calls[0]!.sources[0]!.title).toBe("Página 1 (fls. 2)");
  });

  it("refuses a case file that is not ready, and saves nothing", async () => {
    const { caseFiles, answering, lawyer, db } = await setup();
    const { caseFileId } = await caseFiles.startUpload(lawyer, { name: "Autos.pdf", bytes: 10, pages: 1 });

    const events: AnswerEvent[] = [];
    for await (const event of answering.ask(lawyer, { caseFileId, scope: { kind: "whole-file" }, text: "O que houve?" })) events.push(event);

    expect(events).toEqual([{ type: "refused", reason: "not-ready" }]);
    expect(await db.select().from(schema.question)).toEqual([]);
  });

  it("throws NotFound for another lawyer's case file", async () => {
    const { ingest, ask, lawyer, newLawyer } = await setup();
    const caseFileId = await ingest(lawyer, ["digital"]);

    await expect(ask(await newLawyer(), caseFileId)).rejects.toThrow(NotFound);
  });

  it("refuses a question whose scope and peça disagree", async () => {
    const { ingest, lawyer, db } = await setup();
    const caseFileId = await ingest(lawyer, ["digital"]);

    const insert = db.insert(schema.question).values({ caseFileId, lawyerId: lawyer, scope: "peca", text: "?", answer: [] });

    await expect(insert).rejects.toThrow();
  });
});
