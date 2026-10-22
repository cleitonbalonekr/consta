import type { Metering } from "../metering";
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
 * after the other, and joins the caller's run. A step that ingestion already took the
 * case file to, or past, does nothing, so every ingestion step can run again.
 * Throws NotFound for an unknown case file and InvalidStatus for a move the lifecycle
 * does not show, such as processing a failed case file.
 */
export class CaseFileLifecycle {
  private readonly uow: UnitOfWork;
  private readonly metering: Metering;
  private readonly now: () => Date;

  constructor({ uow, metering, now = () => new Date() }: { uow: UnitOfWork; metering: Metering; now?: () => Date }) {
    this.uow = uow;
    this.metering = metering;
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
    await this.step(caseFileId, "processing", (caseFile) => caseFile.startProcessing());
  }

  async recordPagesRead(caseFileId: CaseFileId, pages: number) {
    await this.step(caseFileId, "mapping", (caseFile) => caseFile.recordPagesRead(pages));
  }

  async startMapping(caseFileId: CaseFileId) {
    await this.step(caseFileId, "mapping", (caseFile) => caseFile.startMapping());
  }

  /** `scannedPages` are the numbers of the pages ingestion did not read, in order. */
  async markReady(caseFileId: CaseFileId, scannedPages: number[]) {
    await this.step(caseFileId, "ready", (caseFile) => caseFile.markReady(this.now(), CaseFileLifecycle.unreadPages(scannedPages)));
  }

  /**
   * Fails the case file with `reason`, shown to the lawyer, so Portuguese, and gives its
   * pages back to the quota. A ready or failed case file stays as it is, with its first reason.
   */
  async fail(caseFileId: CaseFileId, reason: string) {
    await this.uow.run(async () => {
      const failed = await this.change(caseFileId, (caseFile) => {
        if (caseFile.reached("ready") || caseFile.reached("failed")) return false;
        caseFile.fail(reason);
        return true;
      });
      if (failed) await this.metering.givePagesBack(caseFileId);
    });
  }

  /** Runs `move` unless ingestion already took the case file to `status` or past it. */
  private async step(caseFileId: CaseFileId, status: CaseFileStatus, move: (caseFile: CaseFile) => void) {
    await this.change(caseFileId, (caseFile) => {
      if (!caseFile.reached(status)) move(caseFile);
    });
  }

  /** Locks the case file, runs `move` on it, saves it, and returns what `move` returned. */
  private async change<T>(caseFileId: CaseFileId, move: (caseFile: CaseFile) => T): Promise<T> {
    return this.uow.run(async (repos) => {
      const caseFile = await repos.caseFiles.findById(caseFileId, { lock: true });
      if (!caseFile) throw new NotFound(`Case file ${caseFileId} not found.`);
      const result = move(caseFile);
      await repos.caseFiles.save(caseFile);
      return result;
    });
  }

  /** [3, 4, 5, 9] as 3 to 5 and 9 to 9. */
  private static unreadPages(pages: number[]): UnreadPages {
    const ranges: UnreadPages = [];
    for (const page of pages) {
      const last = ranges.at(-1);
      if (last && last.last + 1 === page) last.last = page;
      else ranges.push({ first: page, last: page });
    }
    return ranges;
  }
}
