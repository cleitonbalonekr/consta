import { describe, expect, it } from "vitest";
import { InMemoryUnitOfWork } from "../ports/fakes";
import { CaseFileId, InvalidStatus, LawyerId, NotFound } from "../shared";
import { CaseFileLifecycle } from "./index";
import { caseFilesOn, pdfWithPages } from "./testing";

async function queuedCaseFile() {
  const uow = new InMemoryUnitOfWork();
  const lawyer = LawyerId(crypto.randomUUID());
  const { caseFiles, metering, upload } = caseFilesOn(uow);
  await metering.startTrial(lawyer);
  const caseFileId = await upload(lawyer, await pdfWithPages(4), 4);
  await caseFiles.finishUpload(lawyer, caseFileId);
  const lifecycle = new CaseFileLifecycle({ uow, now: () => new Date("2026-10-17T12:00:00Z") });
  return { caseFiles, lifecycle, lawyer, caseFileId };
}

describe("CaseFileLifecycle", () => {
  it("tells Ingestion what it reads, without a lawyer", async () => {
    const { lifecycle, lawyer, caseFileId } = await queuedCaseFile();

    expect(await lifecycle.target(caseFileId)).toEqual({
      lawyer,
      name: "Autos.pdf",
      storageKey: `case-files/${caseFileId}.pdf`,
      sizeBytes: expect.any(Number),
      pageCount: 4,
      status: "queued",
    });
  });

  it("moves a case file to ready, and each step can run again", async () => {
    const { caseFiles, lifecycle, lawyer, caseFileId } = await queuedCaseFile();

    const twice = async (step: () => Promise<void>) => {
      await step();
      await step();
    };
    await twice(() => lifecycle.startProcessing(caseFileId));
    await twice(() => lifecycle.recordPagesRead(caseFileId, 2));
    await twice(() => lifecycle.startMapping(caseFileId));
    await twice(() => lifecycle.markReady(caseFileId, [{ first: 3, last: 3 }]));

    expect(await caseFiles.view(lawyer, caseFileId)).toMatchObject({ status: "ready", pagesDone: 4, unreadPages: [{ first: 3, last: 3 }] });
  });

  it("keeps the first reason when a case file fails twice", async () => {
    const { caseFiles, lifecycle, lawyer, caseFileId } = await queuedCaseFile();

    await lifecycle.fail(caseFileId, "Não conseguimos ler a página 2.");
    await lifecycle.fail(caseFileId, "Outro motivo.");

    expect(await caseFiles.view(lawyer, caseFileId)).toMatchObject({ status: "failed", error: "Não conseguimos ler a página 2." });
  });

  it("refuses a move the lifecycle does not show, and an unknown case file", async () => {
    const { lifecycle, caseFileId } = await queuedCaseFile();
    await lifecycle.fail(caseFileId, "Não conseguimos ler este arquivo.");

    await expect(lifecycle.startProcessing(caseFileId)).rejects.toBeInstanceOf(InvalidStatus);
    await expect(lifecycle.target(CaseFileId(crypto.randomUUID()))).rejects.toBeInstanceOf(NotFound);
  });
});
