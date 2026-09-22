import "server-only";
import { createAnswering, createCaseFiles, createIngestion, createMetering, ingestInline } from "@consta/core";
import type { Answering, CaseFiles } from "@consta/core";
import { createDb } from "@consta/core/db";
import { InlineJobs } from "@consta/core/fakes";
import { adaptersFromEnv, createTriggerJobs } from "@consta/adapters";

type Container = { caseFiles: CaseFiles; answering: Answering };

let built: Container | undefined;

/**
 * Composition root for the web runtime. With CONSTA_ADAPTERS=fake, ingestion runs
 * in-process instead of on Trigger.dev, so the app works without any account.
 */
export function container(): Container {
  if (built) return built;

  const env = process.env;
  const db = createDb(env.DATABASE_URL ?? "postgres://consta:consta@localhost:5432/consta");
  const adapters = adaptersFromEnv(env);
  const metering = createMetering({ db });

  const ingestion = createIngestion({ db, metering, ...adapters });
  const jobs =
    (env.CONSTA_ADAPTERS ?? "fake") === "fake"
      ? new InlineJobs(() => (caseFileId) => ingestInline(ingestion, caseFileId))
      : createTriggerJobs();

  built = {
    caseFiles: createCaseFiles({ db, files: adapters.files, jobs, metering }),
    answering: createAnswering({ db, metering, ...adapters }),
  };
  return built;
}
