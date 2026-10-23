// Lint config for packages/* and apps/jobs. apps/web has its own Next.js config.
import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

const vendorSdks = {
  group: ["@anthropic-ai/*", "@aws-sdk/*", "voyageai", "@trigger.dev/*", "resend", "stripe", "@consta/adapters"],
  message: "Core never imports vendor SDKs or adapters. Add a port in packages/core/src/ports instead (docs/architecture.md).",
};

const moduleInternals = {
  regex: "^\\.\\./(case-files|ingestion|answering|metering)/",
  message: "Import another module only through its index.ts (docs/architecture.md).",
};

const sqlOutsideRepositories = {
  regex: "^drizzle-orm(/|$)|(^|/)db(/|$)",
  message: "SQL lives only in repositories under src/db (ADR-0006). Use the UnitOfWork's repositories instead.",
};

export default defineConfig([
  globalIgnores(["**/node_modules/**", "**/.next/**", "**/.trigger/**", "apps/web/**", "**/migrations/**"]),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    files: ["packages/core/src/**/*.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [vendorSdks, moduleInternals] }],
    },
  },
  {
    // Replaces the block above outside src/db and tests, so it repeats its patterns.
    files: ["packages/core/src/**/*.ts"],
    ignores: ["packages/core/src/db/**", "packages/core/src/**/*.test.ts"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [vendorSdks, moduleInternals, sqlOutsideRepositories] }],
    },
  },
]);
