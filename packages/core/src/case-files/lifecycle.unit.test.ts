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
  const lifecycle = new CaseFileLifecycle({ uow, metering, now: () => new Date("2026-10-17T12:00:00Z") });
  return { caseFiles, metering, lifecycle, lawyer, caseFileId };
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
    await twice(() => lifecycle.markReady(caseFileId, [1, 3, 4]));

    expect(await caseFiles.view(lawyer, caseFileId)).toMatchObject({
      status: "ready",
      ingesting: false,
      pagesDone: 4,
      unreadPages: [
        { first: 1, last: 1 },
        { first: 3, last: 4 },
      ],
    });
  });

  it("does nothing for a step the case file is already past, as a late retry would", async () => {
    const { caseFiles, lifecycle, lawyer, caseFileId } = await queuedCaseFile();
    await lifecycle.startProcessing(caseFileId);
    await lifecycle.startMapping(caseFileId);

    await lifecycle.startProcessing(caseFileId);
    await lifecycle.recordPagesRead(caseFileId, 1);

    expect(await caseFiles.view(lawyer, caseFileId)).toMatchObject({ status: "mapping", ingesting: true, pagesDone: 4 });
  });

  it("gives the pages back when it fails, and keeps the first reason when it fails twice", async () => {
    const { caseFiles, metering, lifecycle, lawyer, caseFileId } = await queuedCaseFile();
    const charged = await metering.pagesLeft(lawyer);

    await lifecycle.fail(caseFileId, "Não conseguimos ler a página 2.");
    await lifecycle.fail(caseFileId, "Outro motivo.");

    expect(await caseFiles.view(lawyer, caseFileId)).toMatchObject({ status: "failed", ingesting: false, error: "Não conseguimos ler a página 2." });
    expect(await metering.pagesLeft(lawyer)).toBe(charged + 4);
  });

  it("does not fail a ready case file, and keeps its pages charged", async () => {
    const { caseFiles, metering, lifecycle, lawyer, caseFileId } = await queuedCaseFile();
    await lifecycle.startProcessing(caseFileId);
    await lifecycle.startMapping(caseFileId);
    await lifecycle.markReady(caseFileId, []);
    const charged = await metering.pagesLeft(lawyer);

    await lifecycle.fail(caseFileId, "Não conseguimos ler este arquivo.");

    expect((await caseFiles.view(lawyer, caseFileId)).status).toBe("ready");
    expect(await metering.pagesLeft(lawyer)).toBe(charged);
  });

  it("refuses a move the lifecycle does not show, and an unknown case file", async () => {
    const { lifecycle, caseFileId } = await queuedCaseFile();
    await lifecycle.fail(caseFileId, "Não conseguimos ler este arquivo.");

    await expect(lifecycle.startProcessing(caseFileId)).rejects.toBeInstanceOf(InvalidStatus);
    await expect(lifecycle.target(CaseFileId(crypto.randomUUID()))).rejects.toBeInstanceOf(NotFound);
  });
});
