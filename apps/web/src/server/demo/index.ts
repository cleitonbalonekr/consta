import { CaseFileId } from "@consta/core";
import type { Answering, CaseFiles } from "@consta/core";
import { InMemoryFileStore } from "@consta/core/fakes";
import { createDemoAnswering } from "./answering";
import { createDemoCaseFiles } from "./case-files";
import { sampleScript } from "./script";
import { DemoStore } from "./store";

/** What the demo keeps in memory, as the real modules keep it in Postgres and storage. */
export type DemoState = {
  store: DemoStore;
  /** Holds uploaded PDFs; the demo file route stands in for signed storage URLs with it. */
  files: InMemoryFileStore;
};

export type DemoDeps = {
  now: () => number;
  /** Waits between streamed statements, so the demo shows them arriving one at a time. */
  pause: () => Promise<void>;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Empty demo state. Each lawyer starts with a ready case file whose PDF is
 * `public/demo/autos-de-exemplo.pdf`.
 */
export function createDemoState({ now }: { now: () => number }): DemoState {
  const store = new DemoStore(() => {
    const createdAt = now() - ONE_DAY_MS;
    return {
      id: CaseFileId("autos-de-exemplo"),
      name: "Autos de exemplo.pdf",
      pageCount: 10,
      createdAt,
      finishedAt: createdAt,
      failsAtPage: null,
      key: null,
      uploadId: null,
      script: sampleScript(),
    };
  });
  return { store, files: new InMemoryFileStore() };
}

/**
 * In-memory CaseFiles and Answering for the UI prototype: no database, storage or
 * AI provider. Both read and write the same demo state.
 */
export function createDemoModules({ store, files }: DemoState, { now, pause }: DemoDeps): { caseFiles: CaseFiles; answering: Answering } {
  return {
    caseFiles: createDemoCaseFiles({ store, files, now }),
    answering: createDemoAnswering({ store, now, pause }),
  };
}
