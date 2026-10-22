import { describe, expect, it } from "vitest";
import type { Jobs } from "../ports";
import { InMemoryUnitOfWork, RecordingJobs } from "../ports/fakes";
import { CaseFileId, InvalidFileSize, InvalidPageCount, InvalidStatus, LawyerId, NotFound, QuotaExceeded } from "../shared";
import { MAX_BYTES } from "./index";
import { caseFilesOn, pdfWithPages } from "./testing";

/** Fails to start ingestion the first time, as a Trigger.dev outage would, then records like RecordingJobs. */
class FailingOnceJobs extends RecordingJobs implements Jobs {
  private failed = false;

  override async startIngestion(caseFileId: CaseFileId) {
    if (!this.failed) {
      this.failed = true;
      throw new Error("Trigger.dev is down.");
    }
    await super.startIngestion(caseFileId);
  }
}

async function setup(jobs = new RecordingJobs()) {
  const uow = new InMemoryUnitOfWork();
  const lawyer = LawyerId(crypto.randomUUID());
  const built = caseFilesOn(uow, jobs);
  await built.metering.startTrial(lawyer);
  /** Uses up pages of the Trial quota, as earlier case files would. */
  const useQuota = (pages: number) =>
    uow.state.metering.charges.push({ lawyer, caseFileId: CaseFileId(crypto.randomUUID()), pages, createdAt: new Date() });
  return { ...built, uow, lawyer, jobs, useQuota };
}

describe("CaseFiles.startUpload", () => {
  it("opens an upload and lists the case file as uploading with the browser's page count", async () => {
    const { caseFiles, lawyer } = await setup();

    const { caseFileId, uploadId } = await caseFiles.startUpload(lawyer, { name: "Autos 123.pdf", bytes: 2_048, pages: 10 });

    expect(uploadId).toBeTruthy();
    expect(await caseFiles.list(lawyer)).toEqual([
      { id: caseFileId, name: "Autos 123.pdf", status: "uploading", ingesting: true, pageCount: 10, pagesDone: 0, createdAt: expect.any(Date) },
    ]);
  });

  it("refuses a case file over the pages left before anything is stored", async () => {
    const { caseFiles, lawyer, useQuota } = await setup();
    useQuota(450);

    const starting = caseFiles.startUpload(lawyer, { name: "Autos.pdf", bytes: 2_048, pages: 51 });

    await expect(starting).rejects.toEqual(new QuotaExceeded(51, 50));
    expect(await caseFiles.list(lawyer)).toEqual([]);
  });

  it("refuses a case file of more than 5,000 pages or more than 500 MB", async () => {
    const { caseFiles, lawyer } = await setup();

    await expect(caseFiles.startUpload(lawyer, { name: "a.pdf", bytes: 2_048, pages: 5_001 })).rejects.toBeInstanceOf(InvalidPageCount);
    await expect(caseFiles.startUpload(lawyer, { name: "a.pdf", bytes: MAX_BYTES + 1, pages: 10 })).rejects.toBeInstanceOf(InvalidFileSize);
    expect(await caseFiles.list(lawyer)).toEqual([]);
  });
});

describe("CaseFiles.uploadedParts", () => {
  it("lists the parts already sent, so the browser sends only the others", async () => {
    const { caseFiles, files, lawyer } = await setup();
    const { caseFileId } = await caseFiles.startUpload(lawyer, { name: "Autos.pdf", bytes: 2_048, pages: 10 });
    await files.putPart(await caseFiles.signUploadPart(lawyer, caseFileId, 1), new Uint8Array(1_024));

    const parts = await caseFiles.uploadedParts(lawyer, caseFileId);

    expect(parts.map((part) => part.partNumber)).toEqual([1]);
  });
});

describe("CaseFiles.finishUpload", () => {
  it("recounts the pages, charges them, queues the case file and starts ingestion", async () => {
    const { caseFiles, metering, lawyer, jobs, upload } = await setup();
    const pdf = await pdfWithPages(7);
    const caseFileId = await upload(lawyer, pdf, 3);

    const view = await caseFiles.finishUpload(lawyer, caseFileId);

    expect(view).toMatchObject({ id: caseFileId, status: "queued", pageCount: 7, documentMap: [] });
    expect(await metering.pagesLeft(lawyer)).toBe(493);
    expect(jobs.started).toEqual([caseFileId]);
  });

  it("refuses a recount that doesn't fit the quota, charges nothing and keeps the upload open", async () => {
    const { caseFiles, metering, lawyer, jobs, upload, useQuota } = await setup();
    useQuota(495);
    const caseFileId = await upload(lawyer, await pdfWithPages(7), 3);

    await expect(caseFiles.finishUpload(lawyer, caseFileId)).rejects.toEqual(new QuotaExceeded(7, 5));

    expect((await caseFiles.view(lawyer, caseFileId)).status).toBe("uploading");
    expect(await metering.pagesLeft(lawyer)).toBe(5);
    expect(jobs.started).toEqual([]);
  });

  it("charges once when it is called again", async () => {
    const { caseFiles, metering, lawyer, upload } = await setup();
    const caseFileId = await upload(lawyer, await pdfWithPages(7), 7);

    await caseFiles.finishUpload(lawyer, caseFileId);
    const again = await caseFiles.finishUpload(lawyer, caseFileId);

    expect(again.status).toBe("queued");
    expect(await metering.pagesLeft(lawyer)).toBe(493);
  });

  it("keeps the charge and the queued status when Jobs fails after the commit, and a retry starts ingestion", async () => {
    const { caseFiles, metering, lawyer, jobs, upload } = await setup(new FailingOnceJobs());
    const caseFileId = await upload(lawyer, await pdfWithPages(7), 7);

    await expect(caseFiles.finishUpload(lawyer, caseFileId)).rejects.toThrow("Trigger.dev is down.");
    expect((await caseFiles.view(lawyer, caseFileId)).status).toBe("queued");
    expect(await metering.pagesLeft(lawyer)).toBe(493);

    await caseFiles.finishUpload(lawyer, caseFileId);

    expect(jobs.started).toEqual([caseFileId]);
    expect(await metering.pagesLeft(lawyer)).toBe(493);
  });

  it("refuses to sign another part after the upload closed", async () => {
    const { caseFiles, lawyer, upload } = await setup();
    const caseFileId = await upload(lawyer, await pdfWithPages(1), 1);
    await caseFiles.finishUpload(lawyer, caseFileId);

    await expect(caseFiles.signUploadPart(lawyer, caseFileId, 2)).rejects.toBeInstanceOf(InvalidStatus);
  });
});

describe("CaseFiles ownership", () => {
  it("hides a case file from every other lawyer", async () => {
    const { caseFiles, lawyer, upload } = await setup();
    const caseFileId = await upload(lawyer, await pdfWithPages(1), 1);
    const other = LawyerId(crypto.randomUUID());

    await expect(caseFiles.view(other, caseFileId)).rejects.toBeInstanceOf(NotFound);
    await expect(caseFiles.signUploadPart(other, caseFileId, 1)).rejects.toBeInstanceOf(NotFound);
    await expect(caseFiles.uploadedParts(other, caseFileId)).rejects.toBeInstanceOf(NotFound);
    await expect(caseFiles.finishUpload(other, caseFileId)).rejects.toBeInstanceOf(NotFound);
    expect(await caseFiles.list(other)).toEqual([]);
  });
});
