import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

/**
 * Journeys run against a production build (`next build && next start`) with the
 * demo modules and fake adapters: no network, no keys, no Docker.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    // Lawyers read large case files at a desk, so desktop is the default.
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: "**/*.tablet.e2e.ts" },
    // The tablet project covers the responsive layout only.
    { name: "tablet", use: { ...devices["Desktop Chrome"], viewport: { width: 820, height: 1180 }, hasTouch: true }, testMatch: "**/*.tablet.e2e.ts" },
  ],
  webServer: {
    command: `pnpm build && pnpm start --port ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: { CONSTA_MODULES: "demo", CONSTA_ADAPTERS: "fake" },
  },
});
