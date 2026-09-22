import { NotImplemented } from "@consta/core";
import type { Ocr } from "@consta/core/ports";

/** Phase 1 (ingest one real file): implement against the Mistral OCR API, paid tier only (ADR-0005). */
export function createMistralOcr(_config: { apiKey: string; model: string }): Ocr {
  return {
    async read() {
      throw new NotImplemented("MistralOcr.read");
    },
  };
}
