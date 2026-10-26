import { eq, isNull } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { DrizzleUnitOfWork, schema } from "../db";
import { createTestDb, insertLawyer } from "../db/testing";
import { NotFound, QuotaExceeded } from "../shared";
import { caseFilesOn, pdfWithPages } from "./testing";
// A ready case file with every derived row needs ingestion and questions, whose helpers live with Answering.
// eslint-disable-next-line no-restricted-imports
import { answeringOn } from "../answering/testing";

/** CaseFiles on Postgres: what the in-memory fakes can't show, such as the unique charge and the plan lock. */
async function setup() {
  const db = await createTestDb();
  const built = caseFilesOn(new DrizzleUnitOfWork(db));
  const lawyer = await insertLawyer(db);
  await built.metering.startTrial(lawyer);
  const charges = () => db.select({ caseFileId: schema.quotaCharge.caseFileId, pages: schema.quotaCharge.pages }).from(schema.quotaCharge);
  const statusOf = async (id: string) =>
    (await db.select({ status: schema.caseFile.status }).from(schema.caseFile).where(eq(schema.caseFile.id, id)))[0]?.status;
  return { ...built, db, lawyer, charges, statusOf };
}

describe("CaseFiles on Postgres", () => {
  it("refuses an upload over the quota before storing a row", async () => {
    const { caseFiles, db, lawyer } = await setup();

    await expect(caseFiles.startUpload(lawyer, { name: "Autos.pdf", bytes: 2_048, pages: 501 })).rejects.toBeInstanceOf(QuotaExceeded);

    expect(await db.select().from(schema.caseFile)).toEqual([]);
  });

  it("charges and stores the recounted pages, not the browser's", async () => {
    const { caseFiles, lawyer, upload, charges } = await setup();
    const caseFileId = await upload(lawyer, await pdfWithPages(4), 2);

    await caseFiles.finishUpload(lawyer, caseFileId);

    expect(await caseFiles.view(lawyer, caseFileId)).toMatchObject({ status: "queued", pageCount: 4 });
    expect(await charges()).toEqual([{ caseFileId, pages: 4 }]);
  });

  it("charges once when the finish is retried", async () => {
    const { caseFiles, lawyer, upload, charges } = await setup();
    const caseFileId = await upload(lawyer, await pdfWithPages(4), 4);

    await caseFiles.finishUpload(lawyer, caseFileId);
    await caseFiles.finishUpload(lawyer, caseFileId);

    expect(await charges()).toEqual([{ caseFileId, pages: 4 }]);
  });

  it("charges once when two finishes of one case file run at the same time", async () => {
    const { caseFiles, lawyer, upload, charges, statusOf } = await setup();
    const caseFileId = await upload(lawyer, await pdfWithPages(4), 4);

    await Promise.all([caseFiles.finishUpload(lawyer, caseFileId), caseFiles.finishUpload(lawyer, caseFileId)]);

    expect(await charges()).toEqual([{ caseFileId, pages: 4 }]);
    expect(await statusOf(caseFileId)).toBe("queued");
  });

  it("charges only one of two finishes at the same time that together exceed the quota", async () => {
    const { caseFiles, lawyer, upload, charges, statusOf } = await setup();
    const pdf = await pdfWithPages(300);
    const [first, second] = [await upload(lawyer, pdf, 300), await upload(lawyer, pdf, 300)];

    const results = await Promise.allSettled([caseFiles.finishUpload(lawyer, first), caseFiles.finishUpload(lawyer, second)]);

    const refused = results.filter((result) => result.status === "rejected");
    expect(refused).toHaveLength(1);
    expect((refused[0] as PromiseRejectedResult).reason).toEqual(new QuotaExceeded(300, 200));
    expect(await charges()).toHaveLength(1);
    expect([await statusOf(first), await statusOf(second)].sort()).toEqual(["queued", "uploading"]);
  });

  it("hides a case file from another lawyer", async () => {
    const { caseFiles, db, lawyer, upload } = await setup();
    const caseFileId = await upload(lawyer, await pdfWithPages(1), 1);
    const other = await insertLawyer(db);

    await expect(caseFiles.view(other, caseFileId)).rejects.toBeInstanceOf(NotFound);
    await expect(caseFiles.finishUpload(other, caseFileId)).rejects.toBeInstanceOf(NotFound);
    expect(await caseFiles.list(other)).toEqual([]);
  });
});

describe("CaseFiles.remove on Postgres", () => {
  it("leaves no row derived from the case file and no stored PDF, and keeps its usage and quota charge", async () => {
    const db = await createTestDb();
    const built = answeringOn(new DrizzleUnitOfWork(db));
    const lawyer = await insertLawyer(db);
    await built.metering.startTrial(lawyer);
    const caseFileId = await built.ingest(lawyer, ["digital", "digital", "digital"]);
    const kept = await built.ingest(lawyer, ["digital"]);
    await built.ask(lawyer, caseFileId);
    await built.events(lawyer, { caseFileId, quickAction: "amounts" });
    const [row] = await db.select({ storageKey: schema.caseFile.storageKey }).from(schema.caseFile).where(eq(schema.caseFile.id, caseFileId));
    const storageKey = row!.storageKey;
    const tables = [schema.ingestionRange, schema.page, schema.passage, schema.peca, schema.fact, schema.question] as const;
    const rowsOf = async (id: string) => Promise.all(tables.map(async (table) => (await db.select().from(table).where(eq(table.caseFileId, id))).length));
    const usage = (await db.select().from(schema.usageEvent).where(eq(schema.usageEvent.caseFileId, caseFileId))).length;
    const pagesLeft = await built.metering.pagesLeft(lawyer);
    expect((await rowsOf(caseFileId)).every((count) => count > 0)).toBe(true);

    await built.caseFiles.remove(lawyer, caseFileId);

    expect(await db.select().from(schema.caseFile).where(eq(schema.caseFile.id, caseFileId))).toEqual([]);
    expect(await rowsOf(caseFileId)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(built.files.objects.has(storageKey)).toBe(false);
    expect((await rowsOf(kept)).slice(0, 5).every((count) => count > 0)).toBe(true);
    expect(await db.select().from(schema.usageEvent).where(isNull(schema.usageEvent.caseFileId))).toHaveLength(usage);
    expect(await db.select().from(schema.quotaCharge).where(eq(schema.quotaCharge.caseFileId, caseFileId))).toEqual([expect.objectContaining({ pages: 3 })]);
    expect(await built.metering.pagesLeft(lawyer)).toBe(pagesLeft);
  });

  it("throws NotFound for another lawyer's case file", async () => {
    const { caseFiles, db, lawyer, upload, statusOf } = await setup();
    const caseFileId = await upload(lawyer, await pdfWithPages(1), 1);

    await expect(caseFiles.remove(await insertLawyer(db), caseFileId)).rejects.toBeInstanceOf(NotFound);

    expect(await statusOf(caseFileId)).toBe("uploading");
  });
});
