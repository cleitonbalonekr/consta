import type { Metering } from "../metering";
import type { FileStore, Jobs, UnitOfWork, UploadedPart } from "../ports";
import { NotImplemented } from "../shared";
import type { CaseFileId, CaseFileStatus, LawyerId, PecaId, PecaType } from "../shared";

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
  pageCount: number;
  pagesDone: number;
  createdAt: Date;
};

export type CaseFileView = CaseFileSummary & {
  error: string | null;
  /** Empty until the case file is ready. */
  documentMap: PecaView[];
};

/**
 * The life of a case file, from upload to deletion. Every method checks that the
 * lawyer owns the case file and throws NotFound otherwise.
 */
export interface CaseFiles {
  /**
   * The browser reads the page count with pdf.js before calling this.
   * Throws QuotaExceeded before anything is stored.
   */
  startUpload(
    lawyer: LawyerId,
    file: { name: string; bytes: number; pages: number },
  ): Promise<{ caseFileId: CaseFileId; uploadId: string; key: string }>;
  signUploadPart(lawyer: LawyerId, caseFileId: CaseFileId, partNumber: number): Promise<string>;
  /** Lets the browser resume an interrupted upload. */
  uploadedParts(lawyer: LawyerId, caseFileId: CaseFileId): Promise<UploadedPart[]>;
  /**
   * Closes the upload, recounts the pages, re-checks and charges the quota, then
   * starts ingestion. Idempotent.
   */
  finishUpload(lawyer: LawyerId, caseFileId: CaseFileId): Promise<CaseFileView>;
  view(lawyer: LawyerId, caseFileId: CaseFileId): Promise<CaseFileView>;
  list(lawyer: LawyerId): Promise<CaseFileSummary[]>;
  /** A signed URL the viewer reads with HTTP range requests. */
  readUrl(lawyer: LawyerId, caseFileId: CaseFileId): Promise<string>;
  /** Deletes everything derived from the case file, then the PDF. Usage rows stay. */
  remove(lawyer: LawyerId, caseFileId: CaseFileId): Promise<void>;
}

export type CaseFilesDeps = { uow: UnitOfWork; files: FileStore; jobs: Jobs; metering: Metering };

export function createCaseFiles(_deps: CaseFilesDeps): CaseFiles {
  const todo = (method: string) => async (): Promise<never> => {
    throw new NotImplemented(`CaseFiles.${method}`);
  };
  return {
    startUpload: todo("startUpload"),
    signUploadPart: todo("signUploadPart"),
    uploadedParts: todo("uploadedParts"),
    finishUpload: todo("finishUpload"),
    view: todo("view"),
    list: todo("list"),
    readUrl: todo("readUrl"),
    remove: todo("remove"),
  };
}
