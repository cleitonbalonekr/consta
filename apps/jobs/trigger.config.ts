import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "proj_jgnemgausuxywdmmsoek",
  runtime: "node-24",
  dirs: ["./src/trigger"],
  // A 3,600-page case file takes 20 to 40 minutes end to end.
  maxDuration: 60 * 60,
  build: {
    // pdf.js loads its worker from its own folder at run time, so the bundle must not include it.
    external: ["pdfjs-dist"],
  },
  retries: {
    enabledInDev: false,
    default: { maxAttempts: 3, factor: 2, minTimeoutInMs: 1_000, maxTimeoutInMs: 30_000 },
  },
});
