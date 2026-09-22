import { NotImplemented } from "@consta/core";
import type { CitingModel, MapExtractor } from "@consta/core/ports";

export type AnthropicConfig = { apiKey: string };

/**
 * Phase 2: Claude with native citations. Each Source becomes one content block of
 * a custom-content document; citations come back as block indexes (ADR-0003).
 */
export function createClaudeCitingModel(_config: AnthropicConfig & { model: string }): CitingModel {
  return {
    // eslint-disable-next-line require-yield
    async *answer() {
      throw new NotImplemented("ClaudeCitingModel.answer");
    },
  };
}

/** Phase 3: document map and facts from a window of pages, with structured output. */
export function createClaudeMapExtractor(_config: AnthropicConfig & { model: string }): MapExtractor {
  return {
    async extract() {
      throw new NotImplemented("ClaudeMapExtractor.extract");
    },
  };
}
