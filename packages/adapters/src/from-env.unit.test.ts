import { InlineJobs } from "@consta/core/fakes";
import { CaseFileId } from "@consta/core";
import { describe, expect, it } from "vitest";
import { AdaptersFromEnv } from "./from-env";
import { TriggerJobs } from "./trigger-jobs";

const ingest = () => async () => {};

const REAL = {
  CONSTA_ADAPTERS: "real",
  DATABASE_URL: "postgres://prod",
  ANTHROPIC_API_KEY: "sk-ant-key",
  VOYAGE_API_KEY: "pa-key",
  RESEND_API_KEY: "re-key",
  S3_ENDPOINT: "https://r2.example.com",
  S3_BUCKET: "consta",
  S3_ACCESS_KEY_ID: "key-id",
  S3_SECRET_ACCESS_KEY: "secret",
};

describe("AdaptersFromEnv.jobs", () => {
  it("uses Trigger.dev with fake adapters", () => {
    expect(new AdaptersFromEnv({ CONSTA_ADAPTERS: "fake", TRIGGER_SECRET_KEY: "tr_dev_key" }).jobs(ingest)).toBeInstanceOf(TriggerJobs);
  });

  it("uses Trigger.dev with real adapters", () => {
    expect(new AdaptersFromEnv({ ...REAL, TRIGGER_SECRET_KEY: "tr_prod_key" }).jobs(ingest)).toBeInstanceOf(TriggerJobs);
  });

  it("needs the Trigger.dev key, also with fake adapters", () => {
    expect(() => new AdaptersFromEnv({ CONSTA_ADAPTERS: "fake" }).jobs(ingest)).toThrow("Missing environment variable TRIGGER_SECRET_KEY.");
  });

  it("runs ingestion in this process with CONSTA_JOBS=inline, without a key", async () => {
    const started: string[] = [];
    const jobs = new AdaptersFromEnv({ CONSTA_ADAPTERS: "fake", CONSTA_JOBS: "inline" }).jobs(() => async (caseFileId) => {
      started.push(caseFileId);
    });

    await jobs.startIngestion(CaseFileId("case-file-1"));
    await (jobs as InlineJobs).idle();

    expect(jobs).toBeInstanceOf(InlineJobs);
    expect(started).toEqual(["case-file-1"]);
  });
});

describe("AdaptersFromEnv with real adapters", () => {
  it("builds every adapter, with no OCR key, because the MVP does not read scanned pages (ADR-0010)", () => {
    const adapters = new AdaptersFromEnv(REAL);

    expect(() => [adapters.files, adapters.embedder, adapters.reranker, adapters.model, adapters.mapExtractor, adapters.mailer]).not.toThrow();
  });

  it("asks only for the settings of the ports a runtime uses", () => {
    const adapters = new AdaptersFromEnv({ ...REAL, ANTHROPIC_API_KEY: undefined, RESEND_API_KEY: undefined });

    expect(() => [adapters.databaseUrl, adapters.files, adapters.embedder]).not.toThrow();
    expect(() => adapters.model).toThrow("Missing environment variable ANTHROPIC_API_KEY.");
    expect(() => adapters.mapExtractor).toThrow("Missing environment variable ANTHROPIC_API_KEY.");
    expect(() => adapters.mailer).toThrow("Missing environment variable RESEND_API_KEY.");
  });

  it("builds each adapter once", () => {
    const adapters = new AdaptersFromEnv(REAL);

    expect(adapters.embedder).toBe(adapters.embedder);
  });
});

describe("AdaptersFromEnv.databaseUrl", () => {
  it("uses the Postgres of docker-compose.yml in fake mode when none is set", () => {
    expect(new AdaptersFromEnv({}).databaseUrl).toBe("postgres://consta:consta@localhost:5432/consta");
  });

  it("needs DATABASE_URL with real adapters", () => {
    expect(() => new AdaptersFromEnv({ ...REAL, DATABASE_URL: undefined }).databaseUrl).toThrow("Missing environment variable DATABASE_URL.");
  });
});
