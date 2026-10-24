// Copies pdf.js's wasm decoders (JPEG 2000, JBIG2, ICC colour) into public/pdfjs/wasm, where
// src/lib/pdf.ts points pdf.js. pdf.js fetches them by their own names from one folder, so the
// bundler's hashed asset URLs can't serve them. Runs before `next dev` and `next build`.
import { cpSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const pdfjs = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
const target = join(import.meta.dirname, "../public/pdfjs/wasm");

rmSync(target, { recursive: true, force: true });
cpSync(join(pdfjs, "wasm"), target, { recursive: true });
