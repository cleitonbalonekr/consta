import Anthropic from "@anthropic-ai/sdk";
import { NotImplemented } from "@consta/core";
import type { CitingModel, CitingModelEvent, MapExtractor, Source, Usage } from "@consta/core/ports";

export type AnthropicConfig = { apiKey: string };

/** A whole-file answer is about 1,000 tokens (prd-mvp.md, costs); this cap stops a runaway answer at four times that. */
const MAX_TOKENS = 4_000;

/**
 * List prices in USD per million tokens. The requested models, and the models the
 * server-side fallback answers on for them, each at its own rate. A cache write costs
 * 1.25 times an input token.
 */
const USD_PER_MILLION_TOKENS: Record<string, { input: number; output: number; cacheRead: number }> = {
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5 },
};
const CACHE_WRITE = 1.25;

/**
 * Phase 2: Claude with native citations. Each Source becomes one custom-content document
 * of one block, titled with its page, so a citation's document index names its source
 * (ADR-0003). One text block of the reply becomes one text event, with the sources its
 * citations name. A refusal that the server-side fallback does not rescue ends the reply with
 * `declined`, after the usage. Throws for a model it has no price for, so metering never guesses.
 */
export class ClaudeCitingModel implements CitingModel {
  private readonly client: Anthropic;
  private readonly model: string;

  constructor({ apiKey, model }: AnthropicConfig & { model: string }) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
    this.price(model);
  }

  async *answer({ instructions, sources, question, cacheSources }: { instructions: string; sources: Source[]; question: string; cacheSources: boolean }): AsyncIterable<CitingModelEvent> {
    const stream = this.client.beta.messages.stream({
      model: this.model,
      max_tokens: MAX_TOKENS,
      // A declined request runs again on the model the API picks for the reason, inside the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: instructions,
      messages: [{ role: "user", content: [...this.documents(sources, cacheSources), { type: "text", text: question }] }],
    });

    let block: { text: string; sourceIds: Set<string> } | null = null;
    for await (const event of stream) {
      if (event.type === "content_block_start") {
        block = event.content_block.type === "text" ? { text: event.content_block.text, sourceIds: new Set() } : null;
      } else if (event.type === "content_block_delta" && block) {
        if (event.delta.type === "text_delta") block.text += event.delta.text;
        if (event.delta.type === "citations_delta" && event.delta.citation.type === "content_block_location") {
          const source = sources[event.delta.citation.document_index];
          if (source) block.sourceIds.add(source.id);
        }
      } else if (event.type === "content_block_stop" && block) {
        yield { type: "text", text: block.text, sourceIds: [...block.sourceIds] };
        block = null;
      }
    }

    const message = await stream.finalMessage();
    yield { type: "usage", usage: this.usage(message.model, message.usage) };
    if (message.stop_reason === "refusal") yield { type: "declined" };
  }

  /** One document per source, with citations on. With caching, the last document closes the cached prefix. */
  private documents(sources: Source[], cacheSources: boolean): Anthropic.Beta.BetaRequestDocumentBlock[] {
    return sources.map((source, index) => ({
      type: "document",
      source: { type: "content", content: [{ type: "text", text: source.text }] },
      title: source.title,
      citations: { enabled: true },
      ...(cacheSources && index === sources.length - 1 ? { cache_control: { type: "ephemeral" } } : {}),
    }));
  }

  private usage(model: string, usage: Anthropic.Beta.BetaUsage): Usage {
    const written = usage.cache_creation_input_tokens ?? 0;
    const read = usage.cache_read_input_tokens ?? 0;
    const price = this.price(model);
    const inputUsd = (usage.input_tokens + written * CACHE_WRITE) * price.input + read * price.cacheRead;
    const costUsd = (inputUsd + usage.output_tokens * price.output) / 1_000_000;
    const units = usage.input_tokens + written + read + usage.output_tokens;
    return { kind: "answer", provider: "anthropic", model, units, unit: "token", costUsd };
  }

  private price(model: string) {
    const price = USD_PER_MILLION_TOKENS[model];
    if (!price) throw new Error(`No price for the Claude model ${model}.`);
    return price;
  }
}

/** Phase 3: document map and facts from a window of pages, with structured output. */
export function createClaudeMapExtractor(_config: AnthropicConfig & { model: string }): MapExtractor {
  return {
    async extract() {
      throw new NotImplemented("ClaudeMapExtractor.extract");
    },
  };
}
