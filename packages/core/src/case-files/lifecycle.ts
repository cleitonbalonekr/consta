import type { UnitOfWork } from "../ports";
import { NotFound } from "../shared";
import type { CaseFileId, CaseFileStatus, LawyerId } from "../shared";
import type { CaseFile, UnreadPages } from "./case-file";

/** What Ingestion needs to know about the case file it reads. */
export type IngestionTarget = {
  lawyer: LawyerId;
  name: string;
  storageKey: string;
  sizeBytes: number;
  pageCount: number;
  status: CaseFileStatus;
};

/**
 * The status changes that ingestion makes, for the task runtime, which runs without
 * a lawyer. Each method locks the case file row, so parallel ranges change it one
 * after the other, and joins the caller's run. A method that finds the case file
 * already in its target status does nothing, so every ingestion step can be retried.
 * Throws NotFound for an unknown case file and InvalidStatus for a move the lifecycle
 * does not show.
 */
export class CaseFileLifecycle {
  private readonly uow: UnitOfWork;
  private readonly now: () => Date;

  constructor({ uow, now = () => new Date() }: { uow: UnitOfWork; now?: () => Date }) {
    this.uow = uow;
    this.now = now;
  }

  async target(caseFileId: CaseFileId): Promise<IngestionTarget> {
    const caseFile = await this.uow.run((repos) => repos.caseFiles.findById(caseFileId));
    if (!caseFile) throw new NotFound(`Case file ${caseFileId} not found.`);
    const { lawyer, name, storageKey, sizeBytes, pageCount, status } = caseFile.snapshot();
    return { lawyer, name, storageKey, sizeBytes, pageCount, status };
  }

  /** Called when a range starts. */
  async startProcessing(caseFileId: CaseFileId) {
    await this.change(caseFileId, (caseFile) => caseFile.status !== "processing" && caseFile.startProcessing());
  }

  async recordPagesRead(caseFileId: CaseFileId, pages: number) {
    await this.change(caseFileId, (caseFile) => caseFile.recordPagesRead(pages));
  }

  async startMapping(caseFileId: CaseFileId) {
    await this.change(caseFileId, (caseFile) => caseFile.status !== "mapping" && caseFile.startMapping());
  }

  async markReady(caseFileId: CaseFileId, unreadPages: UnreadPages) {
    await this.change(caseFileId, (caseFile) => caseFile.status !== "ready" && caseFile.markReady(this.now(), unreadPages));
  }

  /** `reason` is shown to the lawyer, so it is Portuguese. */
  async fail(caseFileId: CaseFileId, reason: string) {
    await this.change(caseFileId, (caseFile) => caseFile.status !== "failed" && caseFile.fail(reason));
  }

  private async change(caseFileId: CaseFileId, move: (caseFile: CaseFile) => unknown) {
    await this.uow.run(async (repos) => {
      const caseFile = await repos.caseFiles.findById(caseFileId, { lock: true });
      if (!caseFile) throw new NotFound(`Case file ${caseFileId} not found.`);
      move(caseFile);
      await repos.caseFiles.save(caseFile);
    });
  }
}
