import { CaseFileLifecycle, Ingestion, Metering } from "@consta/core";
import { createDb, DrizzleUnitOfWork } from "@consta/core/db";
import { adaptersFromEnv } from "@consta/adapters";

let ingestion: Ingestion | undefined;

/** Composition root for the task runtime. Built once per task process. */
export function container() {
  if (!ingestion) {
    const uow = new DrizzleUnitOfWork(createDb(requiredEnv("DATABASE_URL")));
    const { files, embedder } = adaptersFromEnv(process.env);
    const metering = new Metering({ uow });
    const lifecycle = new CaseFileLifecycle({ uow, metering });
    ingestion = new Ingestion({ uow, files, embedder, metering, lifecycle });
  }
  return { ingestion };
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}.`);
  return value;
}
