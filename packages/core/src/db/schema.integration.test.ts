import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "./schema";
import { createTestDb, insertLawyer } from "./testing";

function embedding(hot: number) {
  return Array.from({ length: schema.EMBEDDING_DIMENSIONS }, (_, i) => (i === hot ? 1 : 0));
}

describe("database schema", () => {
  it("finds passages by Portuguese full-text and by vector distance", async () => {
    const db = await createTestDb();
    const lawyerId = await insertLawyer(db);
    const [caseFile] = await db
      .insert(schema.caseFile)
      .values({ lawyerId, name: "Autos 123", storageKey: "case-files/1.pdf", sizeBytes: 1, pageCount: 2 })
      .returning();
    await db.insert(schema.page).values([1, 2].map((number) => ({ caseFileId: caseFile!.id, number, source: "digital" as const, text: "", blocks: [] })));

    await db.insert(schema.passage).values([
      { caseFileId: caseFile!.id, page: 1, text: "O autor apresentou as petições iniciais.", embedding: embedding(0), embeddingModel: "test", blockIndexes: [0] },
      { caseFileId: caseFile!.id, page: 2, text: "A sentença julgou o pedido procedente.", embedding: embedding(1), embeddingModel: "test", blockIndexes: [0] },
    ]);

    // "sentenças" matches "sentença" only if the portuguese stemmer is in use.
    // The stemmer does NOT join "petição" and "petições" ('petiçã' vs 'petiçõ'):
    // a known gap for lexical search, covered by vector search.
    const byText = await db
      .select({ page: schema.passage.page })
      .from(schema.passage)
      .where(sql`${schema.passage.tsv} @@ plainto_tsquery('portuguese', 'sentenças')`);
    expect(byText).toEqual([{ page: 2 }]);

    const byVector = await db
      .select({ page: schema.passage.page })
      .from(schema.passage)
      .orderBy(sql`${schema.passage.embedding} <=> ${JSON.stringify(embedding(1))}::halfvec`)
      .limit(1);
    expect(byVector).toEqual([{ page: 2 }]);
  });

  it("removes everything derived from a case file when it is deleted, but keeps usage", async () => {
    const db = await createTestDb();
    const lawyerId = await insertLawyer(db);
    const [caseFile] = await db
      .insert(schema.caseFile)
      .values({ lawyerId, name: "Autos 123", storageKey: "case-files/1.pdf", sizeBytes: 1, pageCount: 1 })
      .returning();
    const caseFileId = caseFile!.id;
    await db.insert(schema.page).values({ caseFileId, number: 1, source: "digital", text: "x", blocks: [] });
    await db.insert(schema.usageEvent).values({
      lawyerId, caseFileId, kind: "ocr", provider: "test", model: "test", units: 1, unit: "page", costUsd: "0.004",
    });

    await db.delete(schema.caseFile).where(sql`${schema.caseFile.id} = ${caseFileId}`);

    expect(await db.select().from(schema.page)).toEqual([]);
    const usage = await db.select({ caseFileId: schema.usageEvent.caseFileId }).from(schema.usageEvent);
    expect(usage).toEqual([{ caseFileId: null }]);
  });

  it("refuses a peça whose last page comes before its first", async () => {
    const db = await createTestDb();
    const lawyerId = await insertLawyer(db);
    const [caseFile] = await db
      .insert(schema.caseFile)
      .values({ lawyerId, name: "Autos 123", storageKey: "case-files/1.pdf", sizeBytes: 1, pageCount: 9 })
      .returning();
    const peca = { caseFileId: caseFile!.id, type: "sentenca" as const, title: "Sentença", summary: "Procedente." };

    await db.insert(schema.peca).values({ ...peca, firstPage: 5, lastPage: 5 });
    await expect(db.insert(schema.peca).values({ ...peca, firstPage: 6, lastPage: 5 })).rejects.toThrow();
  });

  it("deletes a page's facts with the page, as a range read again does", async () => {
    const db = await createTestDb();
    const lawyerId = await insertLawyer(db);
    const [caseFile] = await db
      .insert(schema.caseFile)
      .values({ lawyerId, name: "Autos 123", storageKey: "case-files/1.pdf", sizeBytes: 1, pageCount: 2 })
      .returning();
    const caseFileId = caseFile!.id;
    await db.insert(schema.page).values([1, 2].map((number) => ({ caseFileId, number, source: "digital" as const, text: "", blocks: [] })));
    const fact = { caseFileId, kind: "person" as const, value: "Maria Aparecida Souza", context: "autora" };
    await db.insert(schema.fact).values([1, 2].map((page) => ({ ...fact, page })));

    await db.delete(schema.page).where(sql`${schema.page.caseFileId} = ${caseFileId} AND ${schema.page.number} = 1`);

    expect(await db.select({ page: schema.fact.page }).from(schema.fact)).toEqual([{ page: 2 }]);
  });

  it("refuses a case file for a lawyer who has no account", async () => {
    const db = await createTestDb();

    await expect(
      db.insert(schema.caseFile).values({ lawyerId: "nobody", name: "Autos 123", storageKey: "case-files/1.pdf", sizeBytes: 1, pageCount: 1 }),
    ).rejects.toThrow();
  });

  it("keeps a lawyer's account while they have case files, whose PDFs only CaseFiles can remove", async () => {
    const db = await createTestDb();
    const lawyerId = await insertLawyer(db);
    await db.insert(schema.caseFile).values({ lawyerId, name: "Autos 123", storageKey: "case-files/1.pdf", sizeBytes: 1, pageCount: 1 });

    await expect(db.delete(schema.user).where(eq(schema.user.id, lawyerId))).rejects.toThrow();
  });

  it("deletes a lawyer's plan with their account, but keeps usage and quota charges", async () => {
    const db = await createTestDb();
    const lawyerId = await insertLawyer(db);
    await db.insert(schema.lawyerPlan).values({ lawyerId, pageQuota: 500 });
    await db.insert(schema.usageEvent).values({
      lawyerId, kind: "answer", provider: "test", model: "test", units: 1, unit: "token", costUsd: "0.01",
    });
    await db.insert(schema.quotaCharge).values({ lawyerId, pages: 1 });

    await db.delete(schema.user).where(eq(schema.user.id, lawyerId));

    expect(await db.select().from(schema.lawyerPlan)).toEqual([]);
    expect(await db.select({ lawyerId: schema.usageEvent.lawyerId }).from(schema.usageEvent)).toEqual([{ lawyerId }]);
    expect(await db.select({ lawyerId: schema.quotaCharge.lawyerId, pages: schema.quotaCharge.pages }).from(schema.quotaCharge)).toEqual([
      { lawyerId, pages: 1 },
    ]);
  });
});
