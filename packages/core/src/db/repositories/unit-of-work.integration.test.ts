import { meteringRepositoryContract } from "../../ports/contracts/metering-repository.contract";
import { unitOfWorkContract } from "../../ports/contracts/unit-of-work.contract";
import { createDrizzleUnitOfWork, schema } from "../index";
import { createTestDb, insertLawyer } from "../testing";

async function setup() {
  const db = await createTestDb();
  return {
    uow: createDrizzleUnitOfWork(db),
    newLawyer: () => insertLawyer(db),
    addCharge: async (lawyer: string, pages: number, createdAt: Date) => {
      await db.insert(schema.quotaCharge).values({ lawyerId: lawyer, pages, createdAt });
    },
  };
}

unitOfWorkContract(setup);
meteringRepositoryContract(setup);
