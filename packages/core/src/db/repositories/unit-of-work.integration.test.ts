import { caseFileRepositoryContract, meteringRepositoryContract, unitOfWorkContract } from "../../ports/contracts";
import { DrizzleUnitOfWork, schema } from "../index";
import { createTestDb, insertLawyer } from "../testing";

async function setup() {
  const db = await createTestDb();
  return {
    uow: new DrizzleUnitOfWork(db),
    newLawyer: () => insertLawyer(db),
    addCharge: async (lawyer: string, pages: number, createdAt: Date) => {
      await db.insert(schema.quotaCharge).values({ lawyerId: lawyer, pages, createdAt });
    },
  };
}

unitOfWorkContract(setup);
meteringRepositoryContract(setup);
caseFileRepositoryContract(setup);
