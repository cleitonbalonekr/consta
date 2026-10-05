import "server-only";
import { createAnswering, createCaseFiles, createIngestion, createMetering, ingestInline } from "@consta/core";
import type { Answering, CaseFiles } from "@consta/core";
import { createDb } from "@consta/core/db";
import { InlineJobs } from "@consta/core/fakes";
import type { InMemoryFileStore } from "@consta/core/fakes";
import { adaptersFromEnv, createTriggerJobs, mailerFromEnv, usesFakeAdapters } from "@consta/adapters";
import type { MemoryDB } from "better-auth/adapters/memory";
import { createAuth, createAuthMemory } from "./auth";
import type { Auth } from "./auth";
import { createDemoModules, createDemoState } from "./demo";
import type { DemoState } from "./demo";

type Container = {
  caseFiles: CaseFiles;
  answering: Answering;
  auth: Auth;
  /** Only with CONSTA_MODULES=demo: the store the demo file route reads and writes. */
  demoFiles?: InMemoryFileStore;
};

let built: Container | undefined;

// Next.js loads this file once per route bundle, each with its own copy of
// @consta/core. Modules are built per bundle, so `instanceof` on their errors
// works; only the demo state and the in-memory auth tables are shared through
// globalThis, as a database would be.
const shared = globalThis as typeof globalThis & { constaDemoState?: DemoState; constaAuthMemory?: MemoryDB };

const STATEMENT_PAUSE_MS = 350;

/**
 * Composition root for the web runtime. CONSTA_MODULES=demo (the default) serves
 * in-memory demo modules with no database; "real" builds the modules on Postgres.
 * Better Auth reads BETTER_AUTH_SECRET and BETTER_AUTH_URL itself.
 */
export function container(): Container {
  built ??= (process.env.CONSTA_MODULES ?? "demo") === "demo" ? demoContainer() : realContainer();
  return built;
}

/** Lawyers sign in for real, but their accounts live in memory and they have no plans. */
function demoContainer(): Container {
  const state = (shared.constaDemoState ??= createDemoState({ now: Date.now }));
  const modules = createDemoModules(state, {
    now: Date.now,
    pause: () => new Promise((resolve) => setTimeout(resolve, STATEMENT_PAUSE_MS)),
  });
  const auth = createAuth({
    database: { memory: (shared.constaAuthMemory ??= createAuthMemory()) },
    mailer: mailerFromEnv(process.env),
    metering: null,
    limitSignIns: !usesFakeAdapters(process.env),
  });
  return { ...modules, auth, demoFiles: state.files };
}

/** With CONSTA_ADAPTERS=fake, ingestion runs in-process instead of on Trigger.dev. */
function realContainer(): Container {
  const env = process.env;
  const db = createDb(env.DATABASE_URL ?? "postgres://consta:consta@localhost:5432/consta");
  const adapters = adaptersFromEnv(env);
  const metering = createMetering({ db });

  const ingestion = createIngestion({ db, metering, ...adapters });
  const jobs = usesFakeAdapters(env)
    ? new InlineJobs(() => (caseFileId) => ingestInline(ingestion, caseFileId))
    : createTriggerJobs();

  return {
    caseFiles: createCaseFiles({ db, files: adapters.files, jobs, metering }),
    answering: createAnswering({ db, metering, ...adapters }),
    auth: createAuth({ database: { db }, mailer: adapters.mailer, metering, limitSignIns: !usesFakeAdapters(env) }),
  };
}
