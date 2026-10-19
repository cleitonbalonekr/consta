import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import type { NextConfig } from "next";

// The workspace keeps one .env at its root (as `pnpm dev:jobs` does), but Next reads only apps/web/.env*.
// Values already in the environment win, so the settings of the E2E server stay.
const rootEnv = join(process.cwd(), "../../.env");
if (existsSync(rootEnv)) {
  for (const [name, value] of Object.entries(parseEnv(readFileSync(rootEnv, "utf8")))) process.env[name] ??= value;
}

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@consta/core", "@consta/adapters"],
  // pdf.js loads its worker from its own folder at run time, so the server must not bundle it.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
