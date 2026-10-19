import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "test-results/**",
    "playwright-report/**",
  ]),
  {
    // Screens reach modules only through the CaseFiles and Answering interfaces;
    // the composition root alone picks the implementations behind them. Types stay
    // importable, so a screen can name `CaseFiles` without building one.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/server/**"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@consta/core/fakes", "@consta/core/db", "@consta/adapters"],
              message: "Use container() from @/server/container; only the composition root picks implementations.",
            },
          ],
          paths: [
            {
              name: "@consta/core",
              importNames: ["CaseFiles", "Metering", "createAnswering", "createIngestion", "ingestInline"],
              allowTypeImports: true,
              message: "Use container() from @/server/container; only the composition root builds modules.",
            },
          ],
        },
      ],
    },
  },
  {
    // Playwright fixtures call `use`, which is not React's hook.
    files: ["e2e/**/*.ts"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
]);

export default eslintConfig;
