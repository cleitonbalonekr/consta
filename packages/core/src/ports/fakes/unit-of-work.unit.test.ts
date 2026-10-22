import { LawyerId } from "../../shared";
import { answeringRepositoryContract, caseFileRepositoryContract, ingestionRepositoryContract, meteringRepositoryContract, unitOfWorkContract } from "../contracts";
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
    usageRows: async () => uow.state.metering.usage.map(({ lawyer, caseFileId, kind, units, costUsd }) => ({ lawyer, caseFileId, kind, units, costUsd })),
  };
});

ingestionRepositoryContract(async () => {
  const uow = new InMemoryUnitOfWork();
  return {
    uow,
    newLawyer,
    passagePages: async (caseFileId) =>
      uow.state.ingestion.passages.filter((passage) => passage.caseFileId === caseFileId).map((passage) => passage.page).sort((a, b) => a - b),
    facts: async (caseFileId) =>
      uow.state.ingestion.facts
        .filter((fact) => fact.caseFileId === caseFileId)
        .sort((a, b) => a.page - b.page)
        .map(({ caseFileId: _, ...fact }) => fact),
  };
});

answeringRepositoryContract(async () => {
  const uow = new InMemoryUnitOfWork();
  return {
    uow,
    newLawyer,
    questions: async (caseFileId) =>
      uow.state.answering.questions
        .filter((question) => question.caseFileId === caseFileId)
        .map(({ text, scope, answer, dropped }) => ({ text, scope, answer, dropped })),
  };
});
