import { describe, expect, it } from "vitest";
import { CaseFileId, caseFileStatuses, InvalidStatus, LawyerId } from "../shared";
import type { CaseFileStatus } from "../shared";
import { CaseFile, FileSize, PageCount } from "./index";

const stored = { size: FileSize.from(4_096), pages: PageCount.from(12) };

/** Each method of CaseFile and the status it moves to. */
const moves = {
  queue: { to: "queued", run: (caseFile: CaseFile) => caseFile.queue(stored) },
  startProcessing: { to: "processing", run: (caseFile: CaseFile) => caseFile.startProcessing() },
  startMapping: { to: "mapping", run: (caseFile: CaseFile) => caseFile.startMapping() },
  markReady: { to: "ready", run: (caseFile: CaseFile) => caseFile.markReady(new Date("2026-10-10T13:00:00Z")) },
  fail: { to: "failed", run: (caseFile: CaseFile) => caseFile.fail("A página 5 não pôde ser lida.") },
  startDeleting: { to: "deleting", run: (caseFile: CaseFile) => caseFile.startDeleting() },
} satisfies Record<string, { to: CaseFileStatus; run: (caseFile: CaseFile) => void }>;

/** Every arrow of the lifecycle diagram in docs/architecture.md. */
const allowed: Record<CaseFileStatus, Array<keyof typeof moves>> = {
  uploading: ["queue", "startDeleting"],
  queued: ["startProcessing", "fail"],
  processing: ["startMapping", "fail"],
  mapping: ["markReady", "fail"],
  ready: ["startDeleting"],
  failed: ["startDeleting"],
  deleting: [],
};

function newCaseFile() {
  const id = CaseFileId(crypto.randomUUID());
  return CaseFile.start({
    id,
    lawyer: LawyerId("lawyer-1"),
    name: "Autos.pdf",
    storageKey: `case-files/${id}.pdf`,
    uploadId: "upload-1",
    size: FileSize.from(2_048),
    pages: PageCount.from(10),
    createdAt: new Date("2026-10-10T12:00:00Z"),
  });
}

function caseFileIn(status: CaseFileStatus) {
  return CaseFile.restore({ ...newCaseFile().snapshot(), status, uploadId: status === "uploading" ? "upload-1" : null });
}

describe("CaseFile", () => {
  it("starts uploading, with the browser's page count and an open upload", () => {
    const caseFile = newCaseFile();

    expect(caseFile.status).toBe("uploading");
    expect(caseFile.snapshot()).toMatchObject({ pageCount: 10, sizeBytes: 2_048, pagesDone: 0, error: null, readyAt: null });
    expect(caseFile.openUpload()).toEqual({ key: `case-files/${caseFile.id}.pdf`, uploadId: "upload-1" });
  });

  for (const from of caseFileStatuses) {
    for (const [method, move] of Object.entries(moves)) {
      const valid = allowed[from].includes(method as keyof typeof moves);
      it(`${valid ? "moves" : "refuses to move"} from ${from} to ${move.to} with ${method}`, () => {
        const caseFile = caseFileIn(from);

        if (valid) {
          move.run(caseFile);
          expect(caseFile.status).toBe(move.to);
        } else {
          expect(() => move.run(caseFile)).toThrow(InvalidStatus);
          expect(caseFile.status).toBe(from);
        }
      });
    }
  }

  it("keeps the stored size and page count and closes the upload when queued", () => {
    const caseFile = newCaseFile();

    caseFile.queue(stored);

    expect(caseFile.snapshot()).toMatchObject({ sizeBytes: 4_096, pageCount: 12, uploadId: null });
    expect(() => caseFile.openUpload()).toThrow(InvalidStatus);
  });

  it("keeps the reason of a failure and the moment it became ready", () => {
    const failed = caseFileIn("processing");
    const ready = caseFileIn("mapping");

    failed.fail("A página 5 não pôde ser lida.");
    ready.markReady(new Date("2026-10-10T13:00:00Z"));

    expect(failed.snapshot().error).toBe("A página 5 não pôde ser lida.");
    expect(ready.snapshot().readyAt).toEqual(new Date("2026-10-10T13:00:00Z"));
  });

  it("gives a copy of its fields, which can't change its status", () => {
    const caseFile = newCaseFile();

    caseFile.snapshot().status = "ready";

    expect(caseFile.status).toBe("uploading");
  });
});
