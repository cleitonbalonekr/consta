import { createIngestion, createMetering } from "@consta/core";
import type { Ingestion } from "@consta/core";
import { createDb } from "@consta/core/db";
import { adaptersFromEnv } from "@consta/adapters";

let ingestion: Ingestion | undefined;

/** Composition root for the task runtime. Built once per task process. */
export function container() {
  if (!ingestion) {
    const db = createDb(requiredEnv("DATABASE_URL"));
    const { files, ocr, embedder, extractor, mailer } = adaptersFromEnv(process.env);
    const metering = createMetering({ db });
    ingestion = createIngestion({ db, files, ocr, embedder, extractor, mailer, metering });
  }
  return { ingestion };
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}.`);
  return value;
}
