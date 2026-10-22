import type { Embedder, Reranker, Usage } from "@consta/core/ports";

export type VoyageConfig = { apiKey: string };

const VOYAGE_EMBEDDINGS_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_RERANK_URL = "https://api.voyageai.com/v1/rerank";

/** Voyage takes up to 1,000 texts per request; smaller batches stay far from its token limit too. */
const TEXTS_PER_REQUEST = 128;

/** List prices in USD per million tokens (prd-mvp.md). The free first 200M tokens are not subtracted. */
const USD_PER_MILLION_TOKENS: Record<string, number> = { "voyage-4-lite": 0.02, "rerank-3-lite": 0.02 };

type RerankResponse = { data: { index: number; relevance_score: number }[]; usage: { total_tokens: number } };

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

/**
 * Phase 2: reranking with rerank-3-lite, in one request. Training opt-out must be on (ADR-0005).
 * A refused request throws with its status only, because the body may echo the passages.
 */
export class VoyageReranker implements Reranker {
  private readonly apiKey: string;
  private readonly model: string;

  constructor({ apiKey, model }: VoyageConfig & { model: string }) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async rerank(question: string, passages: string[], top: number) {
    const response = await fetch(VOYAGE_RERANK_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: question, documents: passages, model: this.model, top_k: Math.min(top, passages.length) }),
    });
    if (!response.ok) throw new Error(`Voyage refused to rerank ${passages.length} passages with status ${response.status}.`);
    // Voyage's documented response shape: the kept documents, most relevant first.
    const { data, usage } = (await response.json()) as RerankResponse;
    const order = [...data].sort((a, b) => b.relevance_score - a.relevance_score).map((item) => item.index);
    const tokens = usage.total_tokens;
    const costUsd = (tokens / 1_000_000) * (USD_PER_MILLION_TOKENS[this.model] ?? 0);
    return { order, usage: [{ kind: "rerank", provider: "voyage", model: this.model, units: tokens, unit: "token", costUsd } satisfies Usage] };
  }
}
