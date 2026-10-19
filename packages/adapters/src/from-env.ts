import { EMBEDDING_DIMENSIONS } from "@consta/core/db";
import {
  FakeCitingModel,
  FakeEmbedder,
  FakeMapExtractor,
  FakeReranker,
  InlineJobs,
  InMemoryMailer,
} from "@consta/core/fakes";
import type { CaseFileId } from "@consta/core";
import type { CitingModel, Embedder, FileStore, Jobs, Mailer, MapExtractor, Reranker } from "@consta/core/ports";
import { createClaudeCitingModel, createClaudeMapExtractor } from "./anthropic";
import { createResendMailer } from "./resend-mailer";
import { S3FileStore } from "./s3-file-store";
import { TriggerJobs } from "./trigger-jobs";
import { createVoyageReranker, VoyageEmbedder } from "./voyage";

export type ExternalAdapters = {
  files: FileStore;
  embedder: Embedder;
  reranker: Reranker;
  model: CitingModel;
  extractor: MapExtractor;
  mailer: Mailer;
};

type Env = Record<string, string | undefined>;

/**
 * Picks the adapters for every external port. `CONSTA_ADAPTERS=fake` (the default)
 * uses in-memory fakes for the paid services and needs no keys. Object storage is
 * always S3, because the browser uploads to it directly: in fake mode, the MinIO of
 * docker-compose.yml unless S3_* settings say otherwise.
 */
export function adaptersFromEnv(env: Env): ExternalAdapters {
  if (usesFakeAdapters(env)) {
    return {
      files: fileStoreFromEnv(env),
      embedder: new FakeEmbedder(EMBEDDING_DIMENSIONS),
      reranker: new FakeReranker(),
      model: new FakeCitingModel(),
      extractor: new FakeMapExtractor(),
      mailer: mailerFromEnv(env),
    };
  }
  const anthropic = { apiKey: required(env, "ANTHROPIC_API_KEY") };
  const voyage = { apiKey: required(env, "VOYAGE_API_KEY") };
  return {
    files: fileStoreFromEnv(env),
    embedder: new VoyageEmbedder({ ...voyage, model: "voyage-4-lite", dimensions: EMBEDDING_DIMENSIONS }),
    reranker: createVoyageReranker({ ...voyage, model: "rerank-3-lite" }),
    model: createClaudeCitingModel({ ...anthropic, model: "claude-sonnet-5-5" }),
    extractor: createClaudeMapExtractor({ ...anthropic, model: "claude-haiku-5-5" }),
    mailer: mailerFromEnv(env),
  };
}

/**
 * The mailer alone, for the web app's sign-in emails. With fakes, sign-in links
 * go to the server console instead of an inbox.
 */
export function mailerFromEnv(env: Env): Mailer {
  if (usesFakeAdapters(env)) return new InMemoryMailer(console.info);
  return createResendMailer({ apiKey: required(env, "RESEND_API_KEY"), from: env.EMAIL_FROM ?? "Consta <noreply@consta.app>" });
}

/**
 * The Jobs adapter for the web app. Trigger.dev in both modes: locally, `pnpm dev:jobs`
 * runs the tasks on this machine for the Trigger.dev dev environment (ADR-0009).
 * CONSTA_JOBS=inline runs ingestion in this process, for the E2E server, which has no
 * Trigger.dev key; `ingestAll` is asked for only then, so only then is Ingestion built.
 */
export function jobsFromEnv(env: Env, ingestAll: () => (caseFileId: CaseFileId) => Promise<void>): Jobs {
  if (env.CONSTA_JOBS === "inline") return new InlineJobs(ingestAll, logFailedIngestion);
  // The Trigger.dev SDK reads the key from process.env itself; this check fails at start instead of at the first upload.
  required(env, "TRIGGER_SECRET_KEY");
  return new TriggerJobs();
}

/** The case file is already marked failed; the log keeps only its id and the error's name (ADR-0005). */
function logFailedIngestion(caseFileId: CaseFileId, error: unknown) {
  console.error(`Ingestion of case file ${caseFileId} failed: ${error instanceof Error ? error.name : "unknown error"}.`);
}

/** The MinIO of docker-compose.yml, which fake mode uses when no S3 setting is given. */
const LOCAL_MINIO = {
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "consta",
  S3_ACCESS_KEY_ID: "consta",
  S3_SECRET_ACCESS_KEY: "consta-secret",
};

function fileStoreFromEnv(env: Env): FileStore {
  const setting = (name: keyof typeof LOCAL_MINIO) => env[name] || (usesFakeAdapters(env) ? LOCAL_MINIO[name] : required(env, name));
  return new S3FileStore({
    endpoint: setting("S3_ENDPOINT"),
    region: env.S3_REGION || (usesFakeAdapters(env) ? LOCAL_MINIO.S3_REGION : "auto"),
    bucket: setting("S3_BUCKET"),
    accessKeyId: setting("S3_ACCESS_KEY_ID"),
    secretAccessKey: setting("S3_SECRET_ACCESS_KEY"),
  });
}

/** `CONSTA_ADAPTERS=fake`, the default. */
export function usesFakeAdapters(env: Env) {
  return (env.CONSTA_ADAPTERS ?? "fake") === "fake";
}

function required(env: Env, name: string) {
  const value = env[name];
  if (!value) throw new Error(`Missing environment variable ${name}.`);
  return value;
}
