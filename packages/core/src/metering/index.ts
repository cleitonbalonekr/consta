import type { Db } from "../db";
import type { Usage } from "../ports";
import { NotImplemented } from "../shared";
import type { CaseFileId, LawyerId } from "../shared";

/** Records what paid providers cost and how much of a lawyer's page quota is left. */
export interface Metering {
  record(lawyer: LawyerId, caseFileId: CaseFileId | null, usage: Usage[]): Promise<void>;
  /** Pages left this month. Pages count once ingested, even if the case file is deleted later. */
  pagesLeft(lawyer: LawyerId): Promise<number>;
  /** Counts a case file's pages against the quota. Idempotent per case file. */
  chargePages(lawyer: LawyerId, caseFileId: CaseFileId, pages: number): Promise<void>;
}

export type MeteringDeps = { db: Db };

export function createMetering(_deps: MeteringDeps): Metering {
  return {
    async record() {
      throw new NotImplemented("Metering.record");
    },
    async pagesLeft() {
      throw new NotImplemented("Metering.pagesLeft");
    },
    async chargePages() {
      throw new NotImplemented("Metering.chargePages");
    },
  };
}
