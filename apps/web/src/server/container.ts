import "server-only";
import { CaseFiles, createAnswering, Metering } from "@consta/core";
import type { Answering } from "@consta/core";
import { createDb, DrizzleUnitOfWork } from "@consta/core/db";
import { RecordingJobs } from "@consta/core/fakes";
import { adaptersFromEnv, TriggerJobs, usesFakeAdapters } from "@consta/adapters";
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
 * Compose locally). With CONSTA_ADAPTERS=fake, the paid services are fakes and
 * ingestion is only recorded, not run, until Ingestion exists (ticket 05).
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
  const jobs = usesFakeAdapters(env) ? new RecordingJobs() : new TriggerJobs();

  return {
    caseFiles: new CaseFiles({ uow, files: adapters.files, jobs, metering }),
    answering: createAnswering({ uow, metering, ...adapters }),
    auth: createAuth({ db, mailer: adapters.mailer, metering, limitSignIns: !usesFakeAdapters(env) }),
  };
}
