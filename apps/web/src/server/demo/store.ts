import type { CaseFileId, LawyerId } from "@consta/core";
import type { SimulatedIngestion } from "./progress";
import type { DemoScript } from "./script";

export type DemoCaseFile = SimulatedIngestion & {
  id: CaseFileId;
  lawyer: LawyerId;
  name: string;
  createdAt: number;
  /** Where the PDF lives in the demo file store; the seeded one is a static file instead. */
  key: string | null;
  uploadId: string | null;
  script: DemoScript;
};

/** The state that the demo CaseFiles and Answering share, as the real modules share the database. */
export type DemoStore = Map<CaseFileId, DemoCaseFile>;
