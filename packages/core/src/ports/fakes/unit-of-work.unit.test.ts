import { LawyerId } from "../../shared";
import { caseFileRepositoryContract, meteringRepositoryContract, unitOfWorkContract } from "../contracts";
import { InMemoryUnitOfWork } from "./index";

const newLawyer = async () => LawyerId(crypto.randomUUID());

unitOfWorkContract(async () => ({ uow: new InMemoryUnitOfWork(), newLawyer }));

caseFileRepositoryContract(async () => ({ uow: new InMemoryUnitOfWork(), newLawyer }));

meteringRepositoryContract(async () => {
  const uow = new InMemoryUnitOfWork();
  return {
    uow,
    newLawyer,
    addCharge: async (lawyer, pages, createdAt) => {
      uow.state.metering.charges.push({ lawyer, caseFileId: null, pages, createdAt });
    },
  };
});
