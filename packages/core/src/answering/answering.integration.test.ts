import { and, eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { DrizzleUnitOfWork, schema } from "../db";
import { createTestDb, insertLawyer } from "../db/testing";
import { FakeCitingModel, FakeMapExtractor } from "../ports/fakes";
import { NotFound } from "../shared";
import type { CaseFileId } from "../shared";
import { PECA_CHAR_BUDGET, PECA_SUMMARY_PROMPT, PECA_SUMMARY_TEXT } from "./index";
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

describe("Answering about one peça on Postgres", () => {
  /** A ready case file of three digital pages; the fake map makes peças of pages 1–2 and page 3. */
  async function withPecas() {
    const model = new FakeCitingModel();
    const built = await setup({ model });
    const caseFileId = await built.ingest(built.lawyer, ["digital", "digital", "digital"]);
    const [first, second] = await built.documentMap(built.lawyer, caseFileId);
    return { ...built, model, caseFileId, pecas: [first!, second!] as const };
  }

  it("reads only the peça's pages, one source per page, asks to cache them, and saves the peça scope", async () => {
    const { events, lawyer, caseFileId, pecas, model, db } = await withPecas();

    const answer = await events(lawyer, { caseFileId, scope: { kind: "peca", pecaId: pecas[0].id }, text: "Quem é a autora?" });

    expect(model.calls[0]!.sources.map((source) => source.title)).toEqual(["Página 1 (fls. 2)", "Página 2 (fls. 3)"]);
    expect(model.calls[0]!.cacheSources).toBe(true);
    expect(statements(answer).flatMap((statement) => statement.citations.map((citation) => [citation.page, citation.folha]))).toEqual([
      [1, "2"],
      [2, "3"],
    ]);
    const rows = await db.select().from(schema.question).where(eq(schema.question.caseFileId, caseFileId));
    expect(rows).toEqual([expect.objectContaining({ scope: "peca", pecaId: pecas[0].id, text: "Quem é a autora?", answer: statements(answer), droppedStatements: 1 })]);
  });

  it("summarizes a peça from its pages, and saves the summary as a peça question", async () => {
    const { events, lawyer, caseFileId, pecas, model, db } = await withPecas();

    const answer = await events(lawyer, { caseFileId, summarize: pecas[1].id });

    expect(model.calls[0]!.question).toBe(PECA_SUMMARY_PROMPT);
    expect(model.calls[0]!.sources.map((source) => source.title)).toEqual(["Página 3 (fls. 4)"]);
    expect(statements(answer).map((statement) => statement.citations[0].page)).toEqual([3]);
    const rows = await db.select().from(schema.question).where(eq(schema.question.caseFileId, caseFileId));
    expect(rows).toEqual([expect.objectContaining({ scope: "peca", pecaId: pecas[1].id, text: PECA_SUMMARY_TEXT })]);
  });

  it("refuses a peça over the budget as too large, calls no model and saves nothing", async () => {
    const { events, lawyer, caseFileId, pecas, model, db } = await withPecas();
    await db
      .update(schema.page)
      .set({ text: "a".repeat(PECA_CHAR_BUDGET) })
      .where(and(eq(schema.page.caseFileId, caseFileId), eq(schema.page.number, 1)));

    const answer = await events(lawyer, { caseFileId, scope: { kind: "peca", pecaId: pecas[0].id }, text: "O que houve?" });

    expect(answer).toEqual([{ type: "refused", reason: "scope-too-large" }]);
    expect(model.calls).toEqual([]);
    expect(await db.select().from(schema.question)).toEqual([]);
  });

  it("refuses a peça whose digital pages have no text as not readable, calls no model and saves nothing", async () => {
    const { events, lawyer, caseFileId, pecas, model, db } = await withPecas();
    await db
      .update(schema.page)
      .set({ text: "", blocks: [] })
      .where(and(eq(schema.page.caseFileId, caseFileId), inArray(schema.page.number, [1, 2])));

    const answer = await events(lawyer, { caseFileId, scope: { kind: "peca", pecaId: pecas[0].id }, text: "O que houve?" });

    expect(answer).toEqual([{ type: "refused", reason: "not-readable" }]);
    expect(model.calls).toEqual([]);
    expect(await db.select().from(schema.question)).toEqual([]);
  });

  it("answers a peça from its one digital page with text when another has none", async () => {
    const { events, lawyer, caseFileId, pecas, model, db } = await withPecas();
    await db
      .update(schema.page)
      .set({ text: "", blocks: [] })
      .where(and(eq(schema.page.caseFileId, caseFileId), eq(schema.page.number, 1)));

    const answer = await events(lawyer, { caseFileId, scope: { kind: "peca", pecaId: pecas[0].id }, text: "O que houve?" });

    expect(answer.at(-1)).toMatchObject({ type: "done" });
    expect(model.calls[0]!.sources.map((source) => source.title)).toEqual(["Página 2 (fls. 3)"]);
  });

  it("refuses a peça whose pages are all scanned as not readable, and names the scanned pages it left out of another", async () => {
    const model = new FakeCitingModel();
    const { ingest, documentMap, events, lawyer } = await setup({ model });
    const caseFileId = await ingest(lawyer, ["scanned", "scanned", "digital", "scanned"]);
    const [scanned, partly] = await documentMap(lawyer, caseFileId);

    expect(await events(lawyer, { caseFileId, summarize: scanned!.id })).toEqual([{ type: "refused", reason: "not-readable" }]);
    expect((await events(lawyer, { caseFileId, summarize: partly!.id })).at(-1)).toMatchObject({ type: "done", unreadPages: [{ first: 4, last: 4 }] });
    expect(model.calls.map((call) => call.sources.map((source) => source.title))).toEqual([["Página 3 (fls. 4)"]]);
  });

  it("throws NotFound for another case file's peça", async () => {
    const { events, ingest, documentMap, lawyer, caseFileId } = await withPecas();
    const other = await ingest(lawyer, ["digital"]);
    const [othersPeca] = await documentMap(lawyer, other);

    await expect(events(lawyer, { caseFileId, scope: { kind: "peca", pecaId: othersPeca!.id }, text: "?" })).rejects.toThrow(NotFound);
  });
});

describe("Answering a quick action on Postgres", () => {
  /** A ready case file of three digital pages, with one fact of every kind seeded on it. */
  async function withFacts() {
    const model = new FakeCitingModel(({ sources }) => sources.map((source) => ({ text: `${source.blocks[0]}\n`, sourceIds: [source.id] })));
    // A map with no facts, so the seeded ones are all there are.
    const built = await setup({ model, mapExtractor: new FakeMapExtractor(FakeMapExtractor.twoPagePecas) });
    const caseFileId = await built.ingest(built.lawyer, ["digital", "digital", "digital"]);
    const seeded = [
      { kind: "event", value: "Citação do réu", page: 3 },
      { kind: "date", value: "10/03/2026", page: 1 },
      { kind: "person", value: "Maria Aparecida Souza", page: 1 },
      { kind: "role", value: "Autora", page: 2 },
      { kind: "amount", value: "R$ 10.000,00", page: 2 },
    ] as const;
    await built.db.insert(schema.fact).values(seeded.map((fact) => ({ ...fact, caseFileId, context: "contexto" })));
    return { ...built, model, caseFileId };
  }

  it.each([
    ["timeline", "Linha do tempo", ["10/03/2026, contexto", "Citação do réu, contexto"], [[1, "2"], [3, "4"]]],
    ["people", "Pessoas", ["Maria Aparecida Souza, contexto", "Autora, contexto"], [[1, "2"], [2, "3"]]],
    ["amounts", "Valores", ["R$ 10.000,00, contexto"], [[2, "3"]]],
  ] as const)("the %s cites the page and folha of each of its facts, and is saved as a whole-file quick action", async (quickAction, text, quotes, pages) => {
    const { events, lawyer, caseFileId, db } = await withFacts();

    const answer = await events(lawyer, { caseFileId, quickAction });

    const cited = statements(answer).map((statement) => statement.citations[0]);
    expect(cited.map((citation) => citation.quote)).toEqual(quotes);
    expect(cited.map((citation) => [citation.page, citation.folha])).toEqual(pages);
    const rows = await db.select().from(schema.question).where(eq(schema.question.caseFileId, caseFileId));
    expect(rows).toEqual([expect.objectContaining({ scope: "whole-file", quickAction, pecaId: null, text, answer: statements(answer), droppedStatements: 0 })]);
  });
});
