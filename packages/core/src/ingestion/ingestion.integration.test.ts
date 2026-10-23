import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { DrizzleUnitOfWork, schema } from "../db";
import { createTestDb, insertLawyer } from "../db/testing";
import { FakeEmbedder, FakeMapExtractor } from "../ports/fakes";
import type { CaseFileId } from "../shared";
import { PAGES_PER_BATCH } from "./index";
import { fixturePdf, ingestionOn, LEFT_COLUMN, RIGHT_COLUMN } from "./testing";
import type { FixturePage } from "./testing";

/** Ingestion on Postgres through the inline Jobs adapter, with the fixture PDFs. */
async function setup(options: Parameters<typeof ingestionOn>[1] = {}) {
  const db = await createTestDb();
  const built = ingestionOn(new DrizzleUnitOfWork(db), options);
  const lawyer = await insertLawyer(db);
  await built.metering.startTrial(lawyer);
  const pagesOf = (caseFileId: CaseFileId) =>
    db.select().from(schema.page).where(eq(schema.page.caseFileId, caseFileId)).orderBy(schema.page.number);
  const passagesOf = (caseFileId: CaseFileId) =>
    db
      .select({ page: schema.passage.page, text: schema.passage.text, blockIndexes: schema.passage.blockIndexes })
      .from(schema.passage)
      .where(eq(schema.passage.caseFileId, caseFileId))
      .orderBy(schema.passage.page);
  async function ingest(pages: FixturePage[]) {
    const caseFileId = await built.upload(lawyer, await fixturePdf(pages), pages.length);
    await built.jobs.idle();
    return caseFileId;
  }
  return { ...built, db, lawyer, pagesOf, passagesOf, ingest };
}

describe("Ingestion on Postgres", () => {
  it("reads a digital fixture into pages with folhas and passages, records usage and marks the case file ready", async () => {
    const { caseFiles, db, lawyer, ingest, pagesOf, passagesOf } = await setup();

    const caseFileId = await ingest(["digital", "digital"]);

    expect(await caseFiles.view(lawyer, caseFileId)).toMatchObject({ status: "ready", pagesDone: 2, unreadPages: [] });
    expect((await pagesOf(caseFileId)).map(({ number, folha, source }) => ({ number, folha, source }))).toEqual([
      { number: 1, folha: "2", source: "digital" },
      { number: 2, folha: "3", source: "digital" },
    ]);
    expect((await passagesOf(caseFileId)).map((passage) => passage.page)).toEqual([1, 2]);
    const usage = await db.select().from(schema.usageEvent).where(eq(schema.usageEvent.caseFileId, caseFileId));
    expect(usage).toHaveLength(2);
    expect(usage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ lawyerId: lawyer, kind: "embed", model: "fake-embedder" }),
        expect.objectContaining({ lawyerId: lawyer, kind: "extract", model: "fake-map-extractor" }),
      ]),
    );
  });

  it("builds the document map and facts with the fake extractor, and the lawyer sees the map", async () => {
    const mapExtractor = new FakeMapExtractor(({ pages }) => ({
      pecas: [
        { type: "peticao-inicial", title: "Petição inicial", date: "2026-03-10", firstPage: 1, lastPage: 1, summary: "Pede indenização." },
        { type: "sentenca", title: "Sentença", date: null, firstPage: 2, lastPage: pages.at(-1)!.page, summary: "Julga procedente." },
      ],
      facts: [{ kind: "person", value: "Maria Aparecida Souza", normalizedValue: null, context: "autora", page: 1 }],
    }));
    const { caseFiles, db, lawyer, ingest } = await setup({ mapExtractor });

    const caseFileId = await ingest(["digital", "digital", "scanned"]);

    const view = await caseFiles.view(lawyer, caseFileId);
    expect(view.status).toBe("ready");
    expect(view.documentMap.map(({ type, date, firstPage, lastPage }) => ({ type, date, firstPage, lastPage }))).toEqual([
      { type: "peticao-inicial", date: "2026-03-10", firstPage: 1, lastPage: 1 },
      { type: "sentenca", date: null, firstPage: 2, lastPage: 3 },
    ]);
    const facts = await db.select({ value: schema.fact.value, page: schema.fact.page }).from(schema.fact).where(eq(schema.fact.caseFileId, caseFileId));
    expect(facts).toEqual([{ value: "Maria Aparecida Souza", page: 1 }]);
    const extracts = await db
      .select()
      .from(schema.usageEvent)
      .where(and(eq(schema.usageEvent.caseFileId, caseFileId), eq(schema.usageEvent.kind, "extract")));
    expect(extracts).toHaveLength(1);
  });

  it("reads a two-column fixture one column after the other", async () => {
    const { ingest, pagesOf } = await setup();

    const caseFileId = await ingest(["two-column"]);

    const [page] = await pagesOf(caseFileId);
    expect(page!.text).toContain([...LEFT_COLUMN, ...RIGHT_COLUMN].join("\n"));
  });

  it("stores a scanned fixture's pages with no text and no passages, and shows them as not read", async () => {
    const { caseFiles, lawyer, ingest, pagesOf, passagesOf } = await setup();

    const caseFileId = await ingest(["scanned", "digital", "scanned"]);

    expect((await caseFiles.view(lawyer, caseFileId)).unreadPages).toEqual([
      { first: 1, last: 1 },
      { first: 3, last: 3 },
    ]);
    const scanned = (await pagesOf(caseFileId)).filter((page) => page.source === "scanned");
    expect(scanned.map(({ number, text, blocks }) => ({ number, text, blocks }))).toEqual([
      { number: 1, text: "", blocks: [] },
      { number: 3, text: "", blocks: [] },
    ]);
    expect((await passagesOf(caseFileId)).map((passage) => passage.page)).toEqual([2]);
  });

  it("leaves no orphan passages when a range fails half-way and runs again", async () => {
    const fake = new FakeEmbedder();
    let calls = 0;
    const embedder = { model: fake.model, dimensions: fake.dimensions, embed: (texts: string[], as: "passage" | "question") => {
      if (++calls === 2) throw new Error("Voyage is down.");
      return fake.embed(texts, as);
    } };
    const { db, ingest, passagesOf } = await setup({ embedder });

    const caseFileId = await ingest(Array.from({ length: PAGES_PER_BATCH + 2 }, () => "digital"));

    const passages = await passagesOf(caseFileId);
    expect(passages.map((passage) => passage.page)).toEqual(Array.from({ length: PAGES_PER_BATCH + 2 }, (_, i) => i + 1));
    const [range] = await db.select().from(schema.ingestionRange).where(eq(schema.ingestionRange.caseFileId, caseFileId));
    expect(range).toMatchObject({ status: "done", attempts: 2, firstPage: 1, lastPage: PAGES_PER_BATCH + 2 });
  });

  it("fails the case file with a reason and deletes its quota charge, so the pages come back", async () => {
    const fake = new FakeEmbedder();
    const embedder = { model: fake.model, dimensions: fake.dimensions, embed: async () => Promise.reject(new Error("Voyage is down.")) };
    const { caseFiles, metering, db, lawyer, ingest } = await setup({ embedder });

    const caseFileId = await ingest(["digital", "digital", "digital"]);

    expect(await caseFiles.view(lawyer, caseFileId)).toMatchObject({ status: "failed", error: "Não conseguimos ler as páginas 1 a 3." });
    expect(await db.select().from(schema.quotaCharge).where(eq(schema.quotaCharge.caseFileId, caseFileId))).toEqual([]);
    expect(await metering.pagesLeft(lawyer)).toBe(500);
  });

  it("refuses a range whose first page comes after its last", async () => {
    const { db, lawyer } = await setup({ startIngestion: false });
    const [caseFile] = await db
      .insert(schema.caseFile)
      .values({ lawyerId: lawyer, name: "Autos.pdf", storageKey: "case-files/x.pdf", sizeBytes: 1, pageCount: 1 })
      .returning();

    await expect(db.insert(schema.ingestionRange).values({ caseFileId: caseFile!.id, firstPage: 5, lastPage: 4 })).rejects.toThrow();
  });

  it("deletes a page's passages with the page", async () => {
    const { db, ingest, passagesOf } = await setup();
    const caseFileId = await ingest(["digital", "digital"]);

    await db.delete(schema.page).where(and(eq(schema.page.caseFileId, caseFileId), eq(schema.page.number, 1)));

    expect((await passagesOf(caseFileId)).map((passage) => passage.page)).toEqual([2]);
  });
});
