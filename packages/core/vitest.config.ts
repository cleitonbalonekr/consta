import { defineConfig } from "vitest/config";

// Tiers follow docs/agents/testing.md: the file suffix decides the tier.
export default defineConfig({
  test: {
    projects: [
      { test: { name: "unit", environment: "node", include: ["src/**/*.unit.test.ts"] } },
      { test: { name: "integration", environment: "node", include: ["src/**/*.integration.test.ts"] } },
    ],
  },
});
