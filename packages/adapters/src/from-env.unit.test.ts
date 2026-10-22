import { InlineJobs } from "@consta/core/fakes";
import { CaseFileId } from "@consta/core";
import { describe, expect, it } from "vitest";
import { adaptersFromEnv, jobsFromEnv } from "./from-env";
import { TriggerJobs } from "./trigger-jobs";

const ingest = () => async () => {};

describe("jobsFromEnv", () => {
  it("uses Trigger.dev with fake adapters", () => {
    expect(jobsFromEnv({ CONSTA_ADAPTERS: "fake", TRIGGER_SECRET_KEY: "tr_dev_key" }, ingest)).toBeInstanceOf(TriggerJobs);
  });

  it("uses Trigger.dev with real adapters", () => {
    expect(jobsFromEnv({ CONSTA_ADAPTERS: "real", TRIGGER_SECRET_KEY: "tr_prod_key" }, ingest)).toBeInstanceOf(TriggerJobs);
  });

  it("needs the Trigger.dev key, also with fake adapters", () => {
    expect(() => jobsFromEnv({ CONSTA_ADAPTERS: "fake" }, ingest)).toThrow("Missing environment variable TRIGGER_SECRET_KEY.");
  });

  it("runs ingestion in this process with CONSTA_JOBS=inline, without a key", async () => {
    const started: string[] = [];
    const jobs = jobsFromEnv({ CONSTA_ADAPTERS: "fake", CONSTA_JOBS: "inline" }, () => async (caseFileId) => {
      started.push(caseFileId);
    });

    await jobs.startIngestion(CaseFileId("case-file-1"));
    await (jobs as InlineJobs).idle();

    expect(jobs).toBeInstanceOf(InlineJobs);
    expect(started).toEqual(["case-file-1"]);
  });
});

describe("adaptersFromEnv", () => {
  const realEnv = {
    CONSTA_ADAPTERS: "real",
    ANTHROPIC_API_KEY: "sk-ant-key",
    VOYAGE_API_KEY: "pa-key",
    RESEND_API_KEY: "re-key",
    S3_ENDPOINT: "https://r2.example.com",
    S3_BUCKET: "consta",
    S3_ACCESS_KEY_ID: "key-id",
    S3_SECRET_ACCESS_KEY: "secret",
  };

  it("needs no OCR key for real adapters, because the MVP does not read scanned pages (ADR-0010)", () => {
    expect(() => adaptersFromEnv(realEnv)).not.toThrow();
  });

  it("needs the Anthropic key for real adapters", () => {
    expect(() => adaptersFromEnv({ ...realEnv, ANTHROPIC_API_KEY: undefined })).toThrow("Missing environment variable ANTHROPIC_API_KEY.");
  });
});
