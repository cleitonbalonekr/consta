import { RecordingJobs } from "@consta/core/fakes";
import { describe, expect, it } from "vitest";
import { jobsFromEnv } from "./from-env";
import { TriggerJobs } from "./trigger-jobs";

describe("jobsFromEnv", () => {
  it("uses Trigger.dev with fake adapters", () => {
    expect(jobsFromEnv({ CONSTA_ADAPTERS: "fake", TRIGGER_SECRET_KEY: "tr_dev_key" })).toBeInstanceOf(TriggerJobs);
  });

  it("uses Trigger.dev with real adapters", () => {
    expect(jobsFromEnv({ CONSTA_ADAPTERS: "real", TRIGGER_SECRET_KEY: "tr_prod_key" })).toBeInstanceOf(TriggerJobs);
  });

  it("needs the Trigger.dev key, also with fake adapters", () => {
    expect(() => jobsFromEnv({ CONSTA_ADAPTERS: "fake" })).toThrow("Missing environment variable TRIGGER_SECRET_KEY.");
  });

  it("only records the request with CONSTA_JOBS=recording, without a key", () => {
    expect(jobsFromEnv({ CONSTA_ADAPTERS: "fake", CONSTA_JOBS: "recording" })).toBeInstanceOf(RecordingJobs);
  });
});
