import "server-only";
import { Answering, CaseFileLifecycle, CaseFiles, Ingestion, Metering } from "@consta/core";
import { createDb, DrizzleUnitOfWork } from "@consta/core/db";
import { adaptersFromEnv, jobsFromEnv, usesFakeAdapters } from "@consta/adapters";
import { createAuth } from "./auth";
import type { Auth } from "./auth";

type Container = {
  caseFiles: CaseFiles;
  answering: Answering;
  auth: Auth;
};

let built: Container | undefined;

/**
 * Composition root for the web runtime: the modules on Postgres and S3 (Docker
 * Compose locally). With CONSTA_ADAPTERS=fake, the paid services are fakes;
 * ingestion still goes to Trigger.dev (`pnpm dev:jobs` locally), except with
 * CONSTA_JOBS=inline, where this process runs it (the E2E server).
 * Better Auth reads BETTER_AUTH_SECRET and BETTER_AUTH_URL itself.
 */
export function container(): Container {
  built ??= buildContainer();
  return built;
}

function buildContainer(): Container {
  const env = process.env;
  const db = createDb(env.DATABASE_URL ?? "postgres://consta:consta@localhost:5432/consta");
  const uow = new DrizzleUnitOfWork(db);
  const adapters = adaptersFromEnv(env);
  const metering = new Metering({ uow });
  let ingestion: Ingestion | undefined;
  const jobs = jobsFromEnv(env, () => {
    ingestion ??= new Ingestion({ uow, files: adapters.files, embedder: adapters.embedder, metering, lifecycle: new CaseFileLifecycle({ uow, metering }) });
    return (caseFileId) => ingestion!.ingest(caseFileId);
  });

  return {
    caseFiles: new CaseFiles({ uow, files: adapters.files, jobs, metering }),
    answering: new Answering({ uow, metering, embedder: adapters.embedder, reranker: adapters.reranker, model: adapters.model }),
    auth: createAuth({ db, mailer: adapters.mailer, metering, limitSignIns: !usesFakeAdapters(env) }),
  };
}
