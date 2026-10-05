import { defineConfig, devices } from "@playwright/test";
import { SERVER_LOG } from "./e2e/support/server-log";

const PORT = 3100;

/**
 * Journeys run against a production build (`next build && next start`) with the
 * demo modules and fake adapters: no network, no keys, no Docker. Each journey
 * signs in as a new lawyer (see e2e/support/fixtures.ts).
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
    // The server's console goes to SERVER_LOG too, where journeys read the sign-in links the fake mailer logs.
    command: `pnpm build && pnpm start --port ${PORT} 2>&1 | tee ${JSON.stringify(SERVER_LOG)}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: {
      CONSTA_MODULES: "demo",
      CONSTA_ADAPTERS: "fake",
      BETTER_AUTH_SECRET: "e2e-only-secret-for-the-local-production-build",
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
    },
  },
});
