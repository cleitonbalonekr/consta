import { LawyerId } from "../../shared";
import { meteringRepositoryContract } from "../contracts/metering-repository.contract";
import { unitOfWorkContract } from "../contracts/unit-of-work.contract";
import { InMemoryUnitOfWork } from "./index";

const newLawyer = async () => LawyerId(crypto.randomUUID());

unitOfWorkContract(async () => ({ uow: new InMemoryUnitOfWork(), newLawyer }));

meteringRepositoryContract(async () => {
  const uow = new InMemoryUnitOfWork();
  return {
    uow,
    newLawyer,
    addCharge: async (lawyer, pages, createdAt) => {
      uow.state.metering.charges.push({ lawyer, pages, createdAt });
    },
  };
});
