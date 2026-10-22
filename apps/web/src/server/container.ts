import "server-only";
import { Answering, CaseFiles, Ingestion, Metering } from "@consta/core";
import { createDb, DrizzleUnitOfWork } from "@consta/core/db";
import { AdaptersFromEnv } from "@consta/adapters";
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
  const adapters = new AdaptersFromEnv(process.env);
  const db = createDb(adapters.databaseUrl);
  const uow = new DrizzleUnitOfWork(db);
  const metering = new Metering({ uow });
  let ingestion: Ingestion | undefined;
  const jobs = adapters.jobs(() => {
    ingestion ??= new Ingestion({ uow, files: adapters.files, embedder: adapters.embedder, mapExtractor: adapters.mapExtractor, metering });
    return (caseFileId) => ingestion!.ingest(caseFileId);
  });

  return {
    caseFiles: new CaseFiles({ uow, files: adapters.files, jobs, metering }),
    answering: new Answering({ uow, metering, embedder: adapters.embedder, reranker: adapters.reranker, model: adapters.model }),
    auth: createAuth({ db, mailer: adapters.mailer, metering, limitSignIns: !adapters.fake }),
  };
}
