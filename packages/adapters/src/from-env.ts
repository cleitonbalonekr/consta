import { EMBEDDING_DIMENSIONS } from "@consta/core/db";
import {
  FakeCitingModel,
  FakeEmbedder,
  FakeMapExtractor,
  FakeOcr,
  FakeReranker,
  InMemoryFileStore,
  InMemoryMailer,
} from "@consta/core/fakes";
import type { CitingModel, Embedder, FileStore, Mailer, MapExtractor, Ocr, Reranker } from "@consta/core/ports";
import { createClaudeCitingModel, createClaudeMapExtractor } from "./anthropic";
import { createMistralOcr } from "./mistral-ocr";
import { createResendMailer } from "./resend-mailer";
import { createS3FileStore } from "./s3-file-store";
import { createVoyageEmbedder, createVoyageReranker } from "./voyage";

export type ExternalAdapters = {
  files: FileStore;
  ocr: Ocr;
  embedder: Embedder;
  reranker: Reranker;
  model: CitingModel;
  extractor: MapExtractor;
  mailer: Mailer;
};

type Env = Record<string, string | undefined>;

/**
 * Picks the adapters for every external port. `CONSTA_ADAPTERS=fake` (the default)
 * uses in-memory fakes and needs no network or keys.
 */
export function adaptersFromEnv(env: Env): ExternalAdapters {
  if (usesFakeAdapters(env)) {
    return {
      files: new InMemoryFileStore(),
      ocr: new FakeOcr(),
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
    files: createS3FileStore({
      endpoint: required(env, "S3_ENDPOINT"),
      region: env.S3_REGION ?? "auto",
      bucket: required(env, "S3_BUCKET"),
      accessKeyId: required(env, "S3_ACCESS_KEY_ID"),
      secretAccessKey: required(env, "S3_SECRET_ACCESS_KEY"),
    }),
    ocr: createMistralOcr({ apiKey: required(env, "MISTRAL_API_KEY"), model: "mistral-ocr-latest" }),
    embedder: createVoyageEmbedder({ ...voyage, model: "voyage-4-lite", dimensions: EMBEDDING_DIMENSIONS }),
    reranker: createVoyageReranker({ ...voyage, model: "rerank-3-lite" }),
    model: createClaudeCitingModel({ ...anthropic, model: "claude-opus-5" }),
    extractor: createClaudeMapExtractor({ ...anthropic, model: "claude-haiku-4-5" }),
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

/** `CONSTA_ADAPTERS=fake`, the default. */
export function usesFakeAdapters(env: Env) {
  return (env.CONSTA_ADAPTERS ?? "fake") === "fake";
}

function required(env: Env, name: string) {
  const value = env[name];
  if (!value) throw new Error(`Missing environment variable ${name}.`);
  return value;
}
