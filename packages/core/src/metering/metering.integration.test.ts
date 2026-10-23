import { describe, expect, it } from "vitest";
import { DrizzleUnitOfWork, schema } from "../db";
import { createTestDb, insertLawyer } from "../db/testing";
import type { UsageKind } from "../shared";
import { Metering, Month } from "./index";

describe("Metering.costs on Postgres", () => {
  it("totals seeded usage per lawyer and per case file, by kind, for the month in São Paulo", async () => {
    const db = await createTestDb();
    const metering = new Metering({ uow: new DrizzleUnitOfWork(db) });
    const lawyer = await insertLawyer(db);
    const [caseFile] = await db
      .insert(schema.caseFile)
      .values({ lawyerId: lawyer, name: "Autos 123.pdf", storageKey: "case-files/123.pdf", sizeBytes: 2_048, pageCount: 10 })
      .returning({ id: schema.caseFile.id });
    const usage = (caseFileId: string | null, kind: UsageKind, costUsd: string, createdAt: string) =>
      db.insert(schema.usageEvent).values({ lawyerId: lawyer, caseFileId, kind, provider: "test", model: "test", units: 1, unit: "token", costUsd, createdAt: new Date(createdAt) });
    await usage(caseFile!.id, "embed", "0.000024", "2026-10-01T03:00:00Z");
    await usage(caseFile!.id, "embed", "0.000006", "2026-10-15T12:00:00Z");
    await usage(caseFile!.id, "extract", "0.210000", "2026-10-15T12:00:00Z");
    await usage(null, "answer", "0.012500", "2026-10-31T23:59:00Z");
    await usage(caseFile!.id, "answer", "5.000000", "2026-10-01T02:59:59Z");

    const report = await metering.costs(Month.parse("2026-10")!);

    const costs = (partial: Partial<Record<UsageKind, number>>, total: number) => ({ ocr: 0, embed: 0, rerank: 0, extract: 0, answer: 0, ...partial, total });
    expect(report.total).toEqual(costs({ embed: 0.00003, extract: 0.21, answer: 0.0125 }, 0.22253));
    expect(report.lawyers).toEqual([
      {
        lawyer,
        email: `${lawyer}@example.com`,
        costs: costs({ embed: 0.00003, extract: 0.21, answer: 0.0125 }, 0.22253),
        caseFiles: [
          { caseFileId: caseFile!.id, name: "Autos 123.pdf", costs: costs({ embed: 0.00003, extract: 0.21 }, 0.21003) },
          { caseFileId: null, name: null, costs: costs({ answer: 0.0125 }, 0.0125) },
        ],
      },
    ]);
  });
});
