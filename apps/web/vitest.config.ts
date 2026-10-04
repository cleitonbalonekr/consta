import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = { "@": fileURLToPath(new URL("./src", import.meta.url)) };

// Tiers follow docs/agents/testing.md: the file suffix decides the tier. E2E runs in Playwright.
export default defineConfig({
  test: {
    projects: [
      { resolve: { alias }, test: { name: "unit", environment: "node", include: ["src/**/*.unit.test.ts"] } },
      {
        plugins: [react()],
        resolve: { alias },
        test: { name: "component", environment: "jsdom", include: ["src/**/*.component.test.tsx"] },
      },
      {
        resolve: { alias },
        test: { name: "integration", environment: "node", include: ["src/**/*.integration.test.ts"] },
      },
    ],
  },
});
