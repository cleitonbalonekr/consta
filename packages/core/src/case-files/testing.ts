// Test helpers for the Case files tests, unit and integration. Not part of the module's interface.
import { PDFDocument } from "pdf-lib";
import { Metering } from "../metering";
import { InMemoryFileStore, RecordingJobs } from "../ports/fakes";
import type { Jobs, UnitOfWork } from "../ports";
import type { CaseFileId, LawyerId } from "../shared";
import { CaseFiles } from "./index";

/** A real PDF with this many blank pages. */
export async function pdfWithPages(pages: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) pdf.addPage([200, 200]);
  return pdf.save();
}

/** CaseFiles on the given unit of work, with an in-memory file store and a Jobs fake. */
export function caseFilesOn(uow: UnitOfWork, jobs: Jobs = new RecordingJobs(), files = new InMemoryFileStore()) {
  const metering = new Metering({ uow });
  const caseFiles = new CaseFiles({ uow, files, jobs, metering });

  /** What the browser does: starts the upload with its page count, then sends the PDF in one part. */
  async function upload(lawyer: LawyerId, pdf: Uint8Array, claimedPages: number): Promise<CaseFileId> {
    const { caseFileId } = await caseFiles.startUpload(lawyer, { name: "Autos.pdf", bytes: pdf.length, pages: claimedPages });
    await files.putPart(await caseFiles.signUploadPart(lawyer, caseFileId, 1), pdf);
    return caseFileId;
  }

  return { caseFiles, files, metering, upload };
}
