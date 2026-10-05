import type { CaseFileId, LawyerId } from "@consta/core";
import type { SimulatedIngestion } from "./progress";
import type { DemoScript } from "./script";

export type DemoCaseFile = SimulatedIngestion & {
  id: CaseFileId;
  name: string;
  createdAt: number;
  /** Where the PDF lives in the demo file store; the seeded one is a static file instead. */
  key: string | null;
  uploadId: string | null;
  script: DemoScript;
};

/**
 * The state that the demo CaseFiles and Answering share, as the real modules share
 * the database. Case files are kept per lawyer, so a lawyer only ever reaches their own.
 */
export class DemoStore {
  private readonly byLawyer = new Map<LawyerId, Map<CaseFileId, DemoCaseFile>>();

  /** `seed` makes the case file every lawyer starts with. */
  constructor(private readonly seed: () => DemoCaseFile) {}

  /** The lawyer's case files by id. The first call gives the lawyer their own copy of the seeded one. */
  caseFilesOf(lawyer: LawyerId): Map<CaseFileId, DemoCaseFile> {
    let caseFiles = this.byLawyer.get(lawyer);
    if (!caseFiles) {
      const seeded = this.seed();
      caseFiles = new Map([[seeded.id, seeded]]);
      this.byLawyer.set(lawyer, caseFiles);
    }
    return caseFiles;
  }
}
