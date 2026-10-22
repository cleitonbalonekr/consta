import { defineConfig } from "vitest/config";

// Tiers follow docs/agents/testing.md: the file suffix decides the tier.
export default defineConfig({
  test: {
    projects: [
      { test: { name: "unit", environment: "node", include: ["src/**/*.unit.test.ts"] } },
      // A fresh PGlite with every migration takes seconds when the tiers run in parallel.
      { test: { name: "integration", environment: "node", include: ["src/**/*.integration.test.ts"], testTimeout: 30_000 } },
    ],
  },
});
