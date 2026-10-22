import { Ingestion, Metering } from "@consta/core";
import { createDb, DrizzleUnitOfWork } from "@consta/core/db";
import { AdaptersFromEnv } from "@consta/adapters";

let ingestion: Ingestion | undefined;

/** Composition root for the task runtime. Built once per task process; it needs the database, S3, the embedder and the map extractor. */
export function container() {
  if (!ingestion) {
    const adapters = new AdaptersFromEnv(process.env);
    const uow = new DrizzleUnitOfWork(createDb(adapters.databaseUrl));
    ingestion = new Ingestion({
      uow,
      files: adapters.files,
      embedder: adapters.embedder,
      mapExtractor: adapters.mapExtractor,
      metering: new Metering({ uow }),
    });
  }
  return { ingestion };
}
