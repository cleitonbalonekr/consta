import { EMBEDDING_DIMENSIONS } from "@consta/core/db";
import { FakeCitingModel, FakeEmbedder, FakeMapExtractor, FakeReranker, InlineJobs, InMemoryMailer } from "@consta/core/fakes";
import type { CaseFileId } from "@consta/core";
import type { CitingModel, Embedder, FileStore, Jobs, Mailer, MapExtractor, Reranker } from "@consta/core/ports";
import { ClaudeCitingModel, ClaudeMapExtractor } from "./anthropic";
import { createResendMailer } from "./resend-mailer";
import { S3FileStore } from "./s3-file-store";
import { TriggerJobs } from "./trigger-jobs";
import { VoyageEmbedder, VoyageReranker } from "./voyage";

type Env = Record<string, string | undefined>;

/** The Postgres of docker-compose.yml, which fake mode uses when DATABASE_URL is not set. */
const LOCAL_DATABASE_URL = "postgres://consta:consta@localhost:5432/consta";

/** The MinIO of docker-compose.yml, which fake mode uses when no S3 setting is given. */
const LOCAL_MINIO = {
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "consta",
  S3_ACCESS_KEY_ID: "consta",
  S3_SECRET_ACCESS_KEY: "consta-secret",
};

/**
 * The adapters for every external port, picked from the environment. Each is built the
 * first time a runtime asks for it, so a runtime needs the settings of only the ports it
 * uses, and a missing one throws when it is asked for.
 *
 * `CONSTA_ADAPTERS=fake` (the default) uses in-memory fakes for the paid services and
 * needs no keys, and the Postgres and MinIO of docker-compose.yml unless DATABASE_URL and
 * S3_* say otherwise. Object storage is always S3, because the browser uploads to it directly.
 */
export class AdaptersFromEnv {
  private readonly built = new Map<string, unknown>();

  constructor(private readonly env: Env) {}

  /** `CONSTA_ADAPTERS=fake`, the default. */
  get fake(): boolean {
    return (this.env.CONSTA_ADAPTERS ?? "fake") === "fake";
  }

  get databaseUrl(): string {
    return this.env.DATABASE_URL || (this.fake ? LOCAL_DATABASE_URL : this.required("DATABASE_URL"));
  }

  get files(): FileStore {
    return this.once("files", () => {
      const setting = (name: keyof typeof LOCAL_MINIO) => this.env[name] || (this.fake ? LOCAL_MINIO[name] : this.required(name));
      return new S3FileStore({
        endpoint: setting("S3_ENDPOINT"),
        region: this.env.S3_REGION || (this.fake ? LOCAL_MINIO.S3_REGION : "auto"),
        bucket: setting("S3_BUCKET"),
        accessKeyId: setting("S3_ACCESS_KEY_ID"),
        secretAccessKey: setting("S3_SECRET_ACCESS_KEY"),
      });
    });
  }

  get embedder(): Embedder {
    return this.once("embedder", () =>
      this.fake ? new FakeEmbedder(EMBEDDING_DIMENSIONS) : new VoyageEmbedder({ apiKey: this.required("VOYAGE_API_KEY"), model: "voyage-4-lite", dimensions: EMBEDDING_DIMENSIONS }),
    );
  }

  get reranker(): Reranker {
    return this.once("reranker", () => (this.fake ? new FakeReranker() : new VoyageReranker({ apiKey: this.required("VOYAGE_API_KEY"), model: "rerank-3-lite" })));
  }

  get model(): CitingModel {
    return this.once("model", () => (this.fake ? new FakeCitingModel() : new ClaudeCitingModel({ apiKey: this.required("ANTHROPIC_API_KEY"), model: "claude-sonnet-5-5" })));
  }

  /** Claude Haiku 5.5 reads the document map (prd-mvp.md); Sonnet 5.5 comes in only if Haiku fails the document map check. */
  get mapExtractor(): MapExtractor {
    return this.once("mapExtractor", () =>
      this.fake ? new FakeMapExtractor() : new ClaudeMapExtractor({ apiKey: this.required("ANTHROPIC_API_KEY"), model: "claude-haiku-5-5" }),
    );
  }

  /** With fakes, sign-in links go to the server console instead of an inbox. */
  get mailer(): Mailer {
    return this.once("mailer", () =>
      this.fake
        ? new InMemoryMailer(console.info)
        : createResendMailer({ apiKey: this.required("RESEND_API_KEY"), from: this.env.EMAIL_FROM ?? "Consta <noreply@consta.app>" }),
    );
  }

  /**
   * The Jobs adapter for the web app. Trigger.dev in both modes: locally, `pnpm dev:jobs`
   * runs the tasks on this machine for the Trigger.dev dev environment (ADR-0009).
   * CONSTA_JOBS=inline runs ingestion in this process, for the E2E server, which has no
   * Trigger.dev key; `ingest` is asked for only then, so only then is Ingestion built.
   */
  jobs(ingest: () => (caseFileId: CaseFileId) => Promise<void>): Jobs {
    if (this.env.CONSTA_JOBS === "inline") return new InlineJobs(ingest, (caseFileId, error) => this.logFailedIngestion(caseFileId, error));
    // The Trigger.dev SDK reads the key from process.env itself; this check fails at start instead of at the first upload.
    this.required("TRIGGER_SECRET_KEY");
    return new TriggerJobs();
  }

  /** The case file is already marked failed; the log keeps only its id and the error's name (ADR-0005). */
  private logFailedIngestion(caseFileId: CaseFileId, error: unknown) {
    console.error(`Ingestion of case file ${caseFileId} failed: ${error instanceof Error ? error.name : "unknown error"}.`);
  }

  private once<T>(port: string, build: () => T): T {
    if (!this.built.has(port)) this.built.set(port, build());
    // `port` names one getter, which always stores the same type.
    return this.built.get(port) as T;
  }

  private required(name: string): string {
    const value = this.env[name];
    if (!value) throw new Error(`Missing environment variable ${name}.`);
    return value;
  }
}
