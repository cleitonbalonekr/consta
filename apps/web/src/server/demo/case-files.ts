import { CaseFileId, NotFound, QuotaExceeded } from "@consta/core";
import type { CaseFiles, CaseFileSummary, CaseFileView, LawyerId } from "@consta/core";
import type { InMemoryFileStore } from "@consta/core/fakes";
import { ingestionProgress } from "./progress";
import { generatedScript } from "./script";
import type { DemoCaseFile, DemoStore } from "./store";

/** The static copy of the seeded case file's PDF, under `public/`. */
export const SAMPLE_PDF_URL = "/demo/autos-de-exemplo.pdf";

/** Where the demo file route (`app/api/demo/files`) serves the in-memory file store. */
export const DEMO_FILES_PATH = "/api/demo/files";

// File names that script the states a demo upload can't otherwise reach.
const SCRIPTED_QUOTA_EXCEEDED = "sem-cota";
const SCRIPTED_FAILURE = "falha";

type DemoCaseFilesDeps = { store: DemoStore; files: InMemoryFileStore; now: () => number };

/** CaseFiles in memory: uploads land in an in-memory store and ingestion is simulated by the clock. */
export function createDemoCaseFiles({ store, files, now }: DemoCaseFilesDeps): CaseFiles {
  const owned = (lawyer: LawyerId, caseFileId: CaseFileId) => {
    const file = store.get(caseFileId);
    if (!file || file.lawyer !== lawyer) throw new NotFound(`Case file ${caseFileId} not found.`);
    return file;
  };

  const summary = (file: DemoCaseFile): CaseFileSummary => {
    const { status, pagesDone } = ingestionProgress(file, now());
    return { id: file.id, name: file.name, status, pageCount: file.pageCount, pagesDone, createdAt: new Date(file.createdAt) };
  };

  const view = (file: DemoCaseFile): CaseFileView => {
    const { error } = ingestionProgress(file, now());
    const caseFile = summary(file);
    return { ...caseFile, error, documentMap: caseFile.status === "ready" ? file.script.documentMap : [] };
  };

  /** The key and upload of a case file whose upload is still open. */
  const openUpload = (file: DemoCaseFile) => {
    if (!file.key || !file.uploadId) throw new NotFound(`Case file ${file.id} has no open upload.`);
    return { key: file.key, uploadId: file.uploadId };
  };

  return {
    async startUpload(lawyer, { name, pages }) {
      if (name.includes(SCRIPTED_QUOTA_EXCEEDED)) throw new QuotaExceeded(pages, 0);

      const caseFileId = CaseFileId(crypto.randomUUID());
      const key = `case-files/${caseFileId}.pdf`;
      const { uploadId } = await files.startMultipart(key, "application/pdf");
      store.set(caseFileId, {
        id: caseFileId,
        lawyer,
        name,
        pageCount: pages,
        createdAt: now(),
        finishedAt: null,
        failsAtPage: name.includes(SCRIPTED_FAILURE) ? Math.ceil(pages / 2) : null,
        key,
        uploadId,
        script: generatedScript(caseFileId, pages),
      });
      return { caseFileId, uploadId, key };
    },
    async signUploadPart(lawyer, caseFileId, partNumber) {
      const { key, uploadId } = openUpload(owned(lawyer, caseFileId));
      return `${DEMO_FILES_PATH}/${key}?uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`;
    },
    async uploadedParts(lawyer, caseFileId) {
      const { key, uploadId } = openUpload(owned(lawyer, caseFileId));
      return files.listParts(key, uploadId);
    },
    async finishUpload(lawyer, caseFileId) {
      const file = owned(lawyer, caseFileId);
      if (file.finishedAt !== null) return view(file);

      const { key, uploadId } = openUpload(file);
      await files.completeMultipart(key, uploadId, await files.listParts(key, uploadId));
      file.uploadId = null;
      file.finishedAt = now();
      return view(file);
    },
    async view(lawyer, caseFileId) {
      return view(owned(lawyer, caseFileId));
    },
    async list(lawyer) {
      return [...store.values()]
        .filter((file) => file.lawyer === lawyer)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(summary);
    },
    async readUrl(lawyer, caseFileId) {
      const file = owned(lawyer, caseFileId);
      return file.key ? `${DEMO_FILES_PATH}/${file.key}` : SAMPLE_PDF_URL;
    },
    async remove(lawyer, caseFileId) {
      const file = owned(lawyer, caseFileId);
      if (file.key && file.uploadId) await files.abortMultipart(file.key, file.uploadId);
      if (file.key) await files.remove(file.key);
      store.delete(caseFileId);
    },
  };
}
