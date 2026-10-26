import { describe, expect, it } from "vitest";
import type { Jobs } from "../ports";
import { InMemoryFileStore, InMemoryUnitOfWork, RecordingJobs } from "../ports/fakes";
// A ready case file with every derived row needs ingestion and questions, whose helpers live with Answering.
// eslint-disable-next-line no-restricted-imports
import { answeringOn } from "../answering/testing";
import { CaseFileId, InvalidFileSize, InvalidPageCount, InvalidStatus, LawyerId, NotFound, QuotaExceeded } from "../shared";
import { CaseFileLifecycle, MAX_BYTES } from "./index";
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

/** Fails to remove an object the first time, as a storage outage would. */
class FailingOnceFileStore extends InMemoryFileStore {
  private failed = false;

  override async remove(key: string) {
    if (!this.failed) {
      this.failed = true;
      throw new Error("Storage is down.");
    }
    await super.remove(key);
  }
}

async function setup(jobs = new RecordingJobs(), files = new InMemoryFileStore()) {
  const uow = new InMemoryUnitOfWork();
  const lawyer = LawyerId(crypto.randomUUID());
  const built = caseFilesOn(uow, jobs, files);
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
      { id: caseFileId, name: "Autos 123.pdf", status: "uploading", ingesting: true, deletable: true, pageCount: 10, pagesDone: 0, createdAt: expect.any(Date) },
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

    expect(view).toMatchObject({ id: caseFileId, status: "queued", pageCount: 7, documentMap: [], folhas: {} });
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

describe("CaseFiles.view", () => {
  it("gives the folha of each page of a ready case file, so the viewer shows it beside the page number", async () => {
    const { caseFiles, metering, uow, lawyer, upload } = await setup();
    const caseFileId = await upload(lawyer, await pdfWithPages(3), 3);
    await caseFiles.finishUpload(lawyer, caseFileId);
    // What ingestion leaves behind: the pages with their folhas, and the case file ready.
    const page = (number: number, folha: string | null) => ({ caseFileId, number, folha, source: "digital" as const, text: "", blocks: [] });
    uow.state.ingestion.pages.push(page(1, "40"), page(2, null), page(3, "41"));
    const lifecycle = new CaseFileLifecycle({ uow, metering });
    await lifecycle.startProcessing(caseFileId);
    await lifecycle.recordPagesRead(caseFileId, 3);
    await lifecycle.startMapping(caseFileId);
    await lifecycle.markReady(caseFileId, []);

    expect((await caseFiles.view(lawyer, caseFileId)).folhas).toEqual({ 1: "40", 3: "41" });
  });
});

describe("CaseFiles.remove", () => {
  /** A ready case file with pages, passages, peças, facts and two questions, beside another lawyer's. */
  async function withReadyCaseFile() {
    const uow = new InMemoryUnitOfWork();
    const built = answeringOn(uow);
    const [lawyer, other] = [LawyerId(crypto.randomUUID()), LawyerId(crypto.randomUUID())];
    await built.metering.startTrial(lawyer);
    await built.metering.startTrial(other);
    const caseFileId = await built.ingest(lawyer, ["digital", "digital", "digital"]);
    const othersCaseFileId = await built.ingest(other, ["digital"]);
    await built.ask(lawyer, caseFileId);
    await built.events(lawyer, { caseFileId, quickAction: "people" });
    const { storageKey } = uow.state.caseFiles.get(caseFileId)!;
    /** Every row and object left that belongs to the case file. */
    const leftOf = (id: CaseFileId) => {
      const { ingestion, answering } = uow.state;
      const ofIt = (rows: Array<{ caseFileId: CaseFileId | null }>) => rows.filter((row) => row.caseFileId === id).length;
      return {
        caseFile: uow.state.caseFiles.has(id),
        ranges: ofIt(ingestion.ranges),
        pages: ofIt(ingestion.pages),
        passages: ofIt(ingestion.passages),
        pecas: ofIt(ingestion.pecas),
        facts: ofIt(ingestion.facts),
        questions: ofIt(answering.questions),
        usage: ofIt(uow.state.metering.usage),
        pdf: built.files.objects.has(uow.state.caseFiles.get(id)?.storageKey ?? storageKey),
      };
    };
    return { ...built, uow, lawyer, other, caseFileId, othersCaseFileId, storageKey, leftOf };
  }

  it("deletes a ready case file with its pages, passages, peças, facts, questions and stored PDF, and only it", async () => {
    const { caseFiles, lawyer, other, caseFileId, othersCaseFileId, leftOf } = await withReadyCaseFile();
    const othersBefore = leftOf(othersCaseFileId);
    expect(leftOf(caseFileId)).toMatchObject({ caseFile: true, pdf: true, questions: 2 });

    await caseFiles.remove(lawyer, caseFileId);

    expect(leftOf(caseFileId)).toEqual({ caseFile: false, ranges: 0, pages: 0, passages: 0, pecas: 0, facts: 0, questions: 0, usage: 0, pdf: false });
    expect(await caseFiles.list(lawyer)).toEqual([]);
    await expect(caseFiles.view(lawyer, caseFileId)).rejects.toBeInstanceOf(NotFound);
    expect(leftOf(othersCaseFileId)).toEqual(othersBefore);
    expect(await caseFiles.list(other)).toHaveLength(1);
  });

  it("keeps the usage records, with no case file, and the pages charged to the quota", async () => {
    const { caseFiles, metering, uow, lawyer, caseFileId } = await withReadyCaseFile();
    const usage = uow.state.metering.usage.filter((event) => event.caseFileId === caseFileId).length;
    const pagesLeft = await metering.pagesLeft(lawyer);

    await caseFiles.remove(lawyer, caseFileId);

    expect(uow.state.metering.usage.filter((event) => event.lawyer === lawyer && event.caseFileId === null)).toHaveLength(usage);
    expect(usage).toBeGreaterThan(0);
    expect(await metering.pagesLeft(lawyer)).toBe(pagesLeft);
  });

  it("aborts the open upload of a case file still uploading", async () => {
    const { caseFiles, files, lawyer } = await setup();
    const { caseFileId, uploadId } = await caseFiles.startUpload(lawyer, { name: "Autos.pdf", bytes: 2_048, pages: 10 });
    await files.putPart(await caseFiles.signUploadPart(lawyer, caseFileId, 1), new Uint8Array(1_024));

    await caseFiles.remove(lawyer, caseFileId);

    await expect(files.listParts(`case-files/${caseFileId}.pdf`, uploadId)).rejects.toThrow();
    expect(await caseFiles.list(lawyer)).toEqual([]);
  });

  it("throws NotFound for another lawyer's case file, and removes nothing", async () => {
    const { caseFiles, lawyer, other, caseFileId, leftOf } = await withReadyCaseFile();
    const before = leftOf(caseFileId);

    await expect(caseFiles.remove(other, caseFileId)).rejects.toBeInstanceOf(NotFound);

    expect(leftOf(caseFileId)).toEqual(before);
    expect((await caseFiles.view(lawyer, caseFileId)).status).toBe("ready");
  });

  it("refuses a case file while ingestion reads it, and says which case files can be deleted", async () => {
    const { caseFiles, lawyer, upload } = await setup();
    const queued = await upload(lawyer, await pdfWithPages(1), 1);
    await caseFiles.finishUpload(lawyer, queued);
    const { caseFileId: uploading } = await caseFiles.startUpload(lawyer, { name: "Autos.pdf", bytes: 2_048, pages: 1 });

    await expect(caseFiles.remove(lawyer, queued)).rejects.toBeInstanceOf(InvalidStatus);

    const listed = await caseFiles.list(lawyer);
    expect(listed.map(({ id, status, deletable }) => ({ id, status, deletable }))).toEqual([
      { id: uploading, status: "uploading", deletable: true },
      { id: queued, status: "queued", deletable: false },
    ]);
  });

  it("leaves a case file deleting when storage fails, and a retry finishes the delete", async () => {
    const { caseFiles, files, lawyer } = await setup(new RecordingJobs(), new FailingOnceFileStore());
    const { caseFileId } = await caseFiles.startUpload(lawyer, { name: "Autos.pdf", bytes: 2_048, pages: 10 });

    await expect(caseFiles.remove(lawyer, caseFileId)).rejects.toThrow("Storage is down.");
    expect(await caseFiles.list(lawyer)).toEqual([expect.objectContaining({ id: caseFileId, status: "deleting", ingesting: false, deletable: true })]);

    await caseFiles.remove(lawyer, caseFileId);

    expect(await caseFiles.list(lawyer)).toEqual([]);
    expect(files.objects.size).toBe(0);
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
