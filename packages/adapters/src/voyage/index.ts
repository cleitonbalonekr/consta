import { NotImplemented } from "@consta/core";
import type { Embedder, Reranker, Usage } from "@consta/core/ports";

export type VoyageConfig = { apiKey: string };

const VOYAGE_EMBEDDINGS_URL = "https://api.voyageai.com/v1/embeddings";

/** Voyage takes up to 1,000 texts per request; smaller batches stay far from its token limit too. */
const TEXTS_PER_REQUEST = 128;

/** List prices in USD per million tokens (prd-mvp.md). The free first 200M tokens are not subtracted. */
const USD_PER_MILLION_TOKENS: Record<string, number> = { "voyage-4-lite": 0.02 };

type EmbeddingsResponse = { data: { embedding: number[]; index: number }[]; usage: { total_tokens: number } };

/**
 * Phase 1: embeddings with voyage-4-lite at 1,024 dimensions. Training opt-out must be on (ADR-0005).
 * Returns one usage row per request. A refused request throws with its status only, because the body may echo the text.
 */
export class VoyageEmbedder implements Embedder {
  readonly model: string;
  readonly dimensions: number;
  private readonly apiKey: string;

  constructor({ apiKey, model, dimensions }: VoyageConfig & { model: string; dimensions: number }) {
    this.apiKey = apiKey;
    this.model = model;
    this.dimensions = dimensions;
  }

  async embed(texts: string[], as: "passage" | "question") {
    const vectors: number[][] = [];
    const usage: Usage[] = [];
    for (let start = 0; start < texts.length; start += TEXTS_PER_REQUEST) {
      const batch = await this.request(texts.slice(start, start + TEXTS_PER_REQUEST), as);
      vectors.push(...batch.vectors);
      usage.push(batch.usage);
    }
    return { vectors, usage };
  }

  private async request(texts: string[], as: "passage" | "question") {
    const response = await fetch(VOYAGE_EMBEDDINGS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        input: texts,
        model: this.model,
        input_type: as === "passage" ? "document" : "query",
        output_dimension: this.dimensions,
      }),
    });
    if (!response.ok) throw new Error(`Voyage refused ${texts.length} texts with status ${response.status}.`);
    // Voyage's documented response shape; the vector count is checked by Ingestion.
    const { data, usage } = (await response.json()) as EmbeddingsResponse;
    const vectors = [...data].sort((a, b) => a.index - b.index).map((item) => item.embedding);
    const tokens = usage.total_tokens;
    const costUsd = (tokens / 1_000_000) * (USD_PER_MILLION_TOKENS[this.model] ?? 0);
    return { vectors, usage: { kind: "embed", provider: "voyage", model: this.model, units: tokens, unit: "token", costUsd } satisfies Usage };
  }
}

/** Phase 2: reranking with rerank-3-lite. */
export function createVoyageReranker(_config: VoyageConfig & { model: string }): Reranker {
  return {
    async rerank() {
      throw new NotImplemented("VoyageReranker.rerank");
    },
  };
}
