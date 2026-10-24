import type { Metering } from "../metering";
import type { FileStore, Jobs, UnitOfWork, UploadedPart } from "../ports";
import { CaseFileId, NotFound, NotImplemented, QuotaExceeded } from "../shared";
import type { CaseFileStatus, LawyerId, PecaId, PecaType } from "../shared";
import { CaseFile } from "./case-file";
import type { UnreadPages } from "./case-file";
import { PdfPageCounter } from "./pdf-page-counter";
import { FileSize, PageCount } from "./values";

export { CaseFile } from "./case-file";
export type { CaseFileProps, UnreadPages } from "./case-file";
export { CaseFileLifecycle } from "./lifecycle";
export type { IngestionTarget } from "./lifecycle";
export { FileSize, MAX_BYTES, MAX_PAGES, PageCount } from "./values";

export type PecaView = {
  id: PecaId;
  type: PecaType;
  title: string;
  date: string | null;
  firstPage: number;
  lastPage: number;
  summary: string;
};

export type CaseFileSummary = {
  id: CaseFileId;
  name: string;
  status: CaseFileStatus;
  /** True while the case file is on its way to ready or failed, so the page should refresh. */
  ingesting: boolean;
  pageCount: number;
  pagesDone: number;
  createdAt: Date;
};

/** Page number to the folha stamped on it, for the pages that have one. */
export type Folhas = Record<number, string>;

export type CaseFileView = CaseFileSummary & {
  error: string | null;
  /** The scanned pages that were not read, so no answer can cite them (ADR-0010). */
  unreadPages: UnreadPages;
  /** How many pages `unreadPages` covers. */
  unreadPageCount: number;
  /** Every page is scanned, so the PDF has no text Consta can read. False until ready. */
  allPagesScanned: boolean;
  /** Empty until the case file is ready. */
  documentMap: PecaView[];
  /** Empty until the case file is ready. */
  folhas: Folhas;
};

/** Case files' table, behind a port so the module holds no SQL (ADR-0006). */
export interface CaseFileRepository {
  /**
   * The lawyer's case file, or null when it does not exist or another lawyer owns it.
   * With `lock`, its row stays locked until the run ends, so two runs change it one after the other.
   */
  find(lawyer: LawyerId, id: CaseFileId, options?: { lock: boolean }): Promise<CaseFile | null>;
  /** Like find, for any lawyer's case file. Only CaseFileLifecycle uses it, for the task runtime. */
  findById(id: CaseFileId, options?: { lock: boolean }): Promise<CaseFile | null>;
  /** The lawyer's case files, newest first. */
  listOf(lawyer: LawyerId): Promise<CaseFile[]>;
  /** The folhas ingestion found on the case file's pages. */
  folhasOf(id: CaseFileId): Promise<Folhas>;
  /** The peças ingestion found, in page order. */
  documentMapOf(id: CaseFileId): Promise<PecaView[]>;
  /** Inserts a new case file or updates the stored one. */
  save(caseFile: CaseFile): Promise<void>;
}

export type CaseFilesDeps = { uow: UnitOfWork; files: FileStore; jobs: Jobs; metering: Metering; now?: () => Date };

const PDF = "application/pdf";

const READ_URL_SECONDS = 60 * 60;

/** S3 numbers the parts of a multipart upload from 1 to 10,000. */
const MAX_PART_NUMBER = 10_000;

/**
 * The life of a case file, from upload to deletion. Every method checks that the
 * lawyer owns the case file and throws NotFound otherwise.
 */
export class CaseFiles {
  private readonly uow: UnitOfWork;
  private readonly files: FileStore;
  private readonly jobs: Jobs;
  private readonly metering: Metering;
  private readonly now: () => Date;
  private readonly pageCounter: PdfPageCounter;

  constructor({ uow, files, jobs, metering, now = () => new Date() }: CaseFilesDeps) {
    this.uow = uow;
    this.files = files;
    this.jobs = jobs;
    this.metering = metering;
    this.now = now;
    this.pageCounter = new PdfPageCounter(files);
  }

  /**
   * The browser reads the page count with pdf.js before it calls this. Throws
   * InvalidPageCount, InvalidFileSize or QuotaExceeded before anything is stored.
   */
  async startUpload(
    lawyer: LawyerId,
    file: { name: string; bytes: number; pages: number },
  ): Promise<{ caseFileId: CaseFileId; uploadId: string }> {
    const pages = PageCount.from(file.pages);
    const size = FileSize.from(file.bytes);
    const pagesLeft = await this.metering.pagesLeft(lawyer);
    if (pages.value > pagesLeft) throw new QuotaExceeded(pages.value, pagesLeft);

    const id = CaseFileId(crypto.randomUUID());
    const storageKey = `case-files/${id}.pdf`;
    const { uploadId } = await this.files.startMultipart(storageKey, PDF);
    const caseFile = CaseFile.start({ id, lawyer, name: file.name, storageKey, uploadId, size, pages, createdAt: this.now() });
    await this.uow.run((repos) => repos.caseFiles.save(caseFile));
    return { caseFileId: id, uploadId };
  }

  /** A URL the browser PUTs one part to. Parts are numbered from 1. Throws InvalidStatus after the upload closes. */
  async signUploadPart(lawyer: LawyerId, caseFileId: CaseFileId, partNumber: number): Promise<string> {
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > MAX_PART_NUMBER) {
      throw new RangeError(`Part number ${partNumber} is not from 1 to ${MAX_PART_NUMBER}.`);
    }
    const { key, uploadId } = (await this.owned(lawyer, caseFileId)).openUpload();
    return this.files.signPart(key, uploadId, partNumber);
  }

  /** The parts already stored, so the browser resumes an interrupted upload. Throws InvalidStatus after the upload closes. */
  async uploadedParts(lawyer: LawyerId, caseFileId: CaseFileId): Promise<UploadedPart[]> {
    const { key, uploadId } = (await this.owned(lawyer, caseFileId)).openUpload();
    return this.files.listParts(key, uploadId);
  }

  /**
   * Closes the upload, recounts the pages, charges the quota and queues the case
   * file, then starts ingestion. Throws QuotaExceeded when the recount does not
   * fit; the upload then stays open. Idempotent: a retry on a queued case file
   * starts ingestion again, and the Jobs adapter starts it only once.
   */
  async finishUpload(lawyer: LawyerId, caseFileId: CaseFileId): Promise<CaseFileView> {
    const caseFile = await this.owned(lawyer, caseFileId);
    if (caseFile.status === "uploading") await this.queue(lawyer, caseFile);
    else if (caseFile.status !== "queued") return this.view(lawyer, caseFileId);

    // After the commit: a failure here leaves the case file queued, and a retry starts it again.
    await this.jobs.startIngestion(caseFileId);
    return this.view(lawyer, caseFileId);
  }

  async view(lawyer: LawyerId, caseFileId: CaseFileId): Promise<CaseFileView> {
    return this.uow.run(async (repos) => {
      const caseFile = await this.owned(lawyer, caseFileId);
      if (caseFile.status !== "ready") return toView(caseFile, { documentMap: [], folhas: {} });
      const documentMap = await repos.caseFiles.documentMapOf(caseFileId);
      const folhas = await repos.caseFiles.folhasOf(caseFileId);
      return toView(caseFile, { documentMap, folhas });
    });
  }

  async list(lawyer: LawyerId): Promise<CaseFileSummary[]> {
    const caseFiles = await this.uow.run((repos) => repos.caseFiles.listOf(lawyer));
    return caseFiles.map(toSummary);
  }

  /** A signed URL the viewer reads with HTTP range requests. Valid for one hour. */
  async readUrl(lawyer: LawyerId, caseFileId: CaseFileId): Promise<string> {
    const { storageKey } = (await this.owned(lawyer, caseFileId)).snapshot();
    return this.files.readUrl(storageKey, READ_URL_SECONDS);
  }

  /** Deletes everything derived from the case file, then the PDF. Usage rows stay. */
  async remove(_lawyer: LawyerId, _caseFileId: CaseFileId): Promise<void> {
    throw new NotImplemented("CaseFiles.remove");
  }

  /** The external calls come first, so the run holds only database work (ADR-0007). */
  private async queue(lawyer: LawyerId, caseFile: CaseFile) {
    const { key, uploadId } = caseFile.openUpload();
    const { bytes } = await this.files.completeMultipart(key, uploadId);
    const size = FileSize.from(bytes);
    const pages = PageCount.from(await this.pageCounter.count(key, bytes));

    await this.uow.run(async (repos) => {
      // A finish that ran at the same time may have queued it while this one counted pages.
      const current = await repos.caseFiles.find(lawyer, caseFile.id, { lock: true });
      if (current?.status !== "uploading") return;
      await this.metering.chargePages(lawyer, caseFile.id, pages.value);
      current.queue({ size, pages });
      await repos.caseFiles.save(current);
    });
  }

  private async owned(lawyer: LawyerId, caseFileId: CaseFileId): Promise<CaseFile> {
    const caseFile = await this.uow.run((repos) => repos.caseFiles.find(lawyer, caseFileId));
    if (!caseFile) throw new NotFound(`Case file ${caseFileId} not found.`);
    return caseFile;
  }
}

function toSummary(caseFile: CaseFile): CaseFileSummary {
  const { id, name, status, pageCount, pagesDone, createdAt } = caseFile.snapshot();
  return { id, name, status, ingesting: caseFile.ingesting, pageCount, pagesDone, createdAt };
}

function toView(caseFile: CaseFile, derived: Pick<CaseFileView, "documentMap" | "folhas">): CaseFileView {
  const { error, unreadPages } = caseFile.snapshot();
  const { unreadPageCount, allPagesScanned } = caseFile;
  return { ...toSummary(caseFile), error, unreadPages, unreadPageCount, allPagesScanned, ...derived };
}
