import { asc, desc, eq } from "drizzle-orm";
import {
  answeringRepositoryContract,
  caseFileRepositoryContract,
  ingestionRepositoryContract,
  meteringRepositoryContract,
  unitOfWorkContract,
} from "../../ports/contracts";
import { DrizzleUnitOfWork, schema } from "../index";
import { createTestDb, insertLawyer } from "../testing";
import { CaseFileId, LawyerId } from "../../shared";

async function setup() {
  const db = await createTestDb();
  return {
    uow: new DrizzleUnitOfWork(db),
    newLawyer: () => insertLawyer(db),
    addCharge: async (lawyer: string, pages: number, createdAt: Date) => {
      await db.insert(schema.quotaCharge).values({ lawyerId: lawyer, pages, createdAt });
    },
    passagePages: async (caseFileId: CaseFileId) => {
      const rows = await db
        .select({ page: schema.passage.page })
        .from(schema.passage)
        .where(eq(schema.passage.caseFileId, caseFileId))
        .orderBy(asc(schema.passage.page));
      return rows.map((row) => row.page);
    },
    questions: async (caseFileId: CaseFileId) => {
      const rows = await db.select().from(schema.question).where(eq(schema.question.caseFileId, caseFileId)).orderBy(asc(schema.question.createdAt));
      return rows.map(({ text, scope, answer, droppedStatements }) => ({ text, scope, answer, dropped: droppedStatements }));
    },
    usageRows: async () => {
      const rows = await db.select().from(schema.usageEvent).orderBy(desc(schema.usageEvent.units));
      return rows.map((row) => ({
        lawyer: LawyerId(row.lawyerId),
        caseFileId: row.caseFileId === null ? null : CaseFileId(row.caseFileId),
        kind: row.kind,
        units: row.units,
        costUsd: Number(row.costUsd),
      }));
    },
  };
}

unitOfWorkContract(setup);
meteringRepositoryContract(setup);
caseFileRepositoryContract(setup);
ingestionRepositoryContract(setup);
answeringRepositoryContract(setup);
