import { NotImplemented } from "@consta/core";
import type { Embedder, Reranker } from "@consta/core/ports";

export type VoyageConfig = { apiKey: string };

/** Phase 1: embeddings with voyage-4-lite at 1,024 dimensions. Training opt-out must be on (ADR-0005). */
export function createVoyageEmbedder(_config: VoyageConfig & { model: string; dimensions: number }): Embedder {
  return {
    model: _config.model,
    dimensions: _config.dimensions,
    async embed() {
      throw new NotImplemented("VoyageEmbedder.embed");
    },
  };
}

/** Phase 2: reranking with rerank-3-lite. */
export function createVoyageReranker(_config: VoyageConfig & { model: string }): Reranker {
  return {
    async rerank() {
      throw new NotImplemented("VoyageReranker.rerank");
    },
  };
}
