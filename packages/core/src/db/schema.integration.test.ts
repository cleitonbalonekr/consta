import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as schema from "./schema";

async function migratedDb() {
  const client = new PGlite({ extensions: { vector } });
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)) });
  return db;
}

function embedding(hot: number) {
  return Array.from({ length: schema.EMBEDDING_DIMENSIONS }, (_, i) => (i === hot ? 1 : 0));
}

describe("database schema", () => {
  it("finds passages by Portuguese full-text and by vector distance", async () => {
    const db = await migratedDb();
    const [caseFile] = await db
      .insert(schema.caseFile)
      .values({ lawyerId: "lawyer-1", name: "Autos 123", storageKey: "case-files/1.pdf", sizeBytes: 1, pageCount: 2 })
      .returning();

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
    const db = await migratedDb();
    const [caseFile] = await db
      .insert(schema.caseFile)
      .values({ lawyerId: "lawyer-1", name: "Autos 123", storageKey: "case-files/1.pdf", sizeBytes: 1, pageCount: 1 })
      .returning();
    const caseFileId = caseFile!.id;
    await db.insert(schema.page).values({ caseFileId, number: 1, source: "digital", text: "x", blocks: [] });
    await db.insert(schema.usageEvent).values({
      lawyerId: "lawyer-1", caseFileId, kind: "ocr", provider: "test", model: "test", units: 1, unit: "page", costUsd: "0.004",
    });

    await db.delete(schema.caseFile).where(sql`${schema.caseFile.id} = ${caseFileId}`);

    expect(await db.select().from(schema.page)).toEqual([]);
    const usage = await db.select({ caseFileId: schema.usageEvent.caseFileId }).from(schema.usageEvent);
    expect(usage).toEqual([{ caseFileId: null }]);
  });
});
