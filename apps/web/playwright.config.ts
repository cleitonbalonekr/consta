import { defineConfig, devices } from "@playwright/test";
import { OPERATOR_EMAIL } from "./e2e/support/operator";
import { SERVER_LOG } from "./e2e/support/server-log";

const PORT = 3100;

/**
 * Journeys run against a production build (`next build && next start`) with fake
 * adapters for the paid services and inline Jobs: no keys. Postgres and MinIO come from Docker
 * Compose (`docker compose up -d` first). Each journey signs in as a new lawyer
 * (see e2e/support/fixtures.ts).
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
    command: `pnpm --dir ../.. db:migrate && pnpm build && pnpm start --port ${PORT} 2>&1 | tee ${JSON.stringify(SERVER_LOG)}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    // The local services of docker-compose.yml, as in .env.example.
    env: {
      CONSTA_ADAPTERS: "fake",
      // No Trigger.dev key here: the server runs ingestion in its own process.
      CONSTA_JOBS: "inline",
      DATABASE_URL: "postgres://consta:consta@localhost:5432/consta",
      S3_ENDPOINT: "http://localhost:9000",
      S3_REGION: "us-east-1",
      S3_BUCKET: "consta",
      S3_ACCESS_KEY_ID: "consta",
      S3_SECRET_ACCESS_KEY: "consta-secret",
      BETTER_AUTH_SECRET: "e2e-only-secret-for-the-local-production-build",
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      OPERATOR_EMAILS: OPERATOR_EMAIL,
    },
  },
});
