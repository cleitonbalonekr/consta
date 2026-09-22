import type { Reranker } from "../reranker";

/** Keeps the incoming order. */
export class FakeReranker implements Reranker {
  async rerank(_question: string, passages: string[], top: number) {
    return {
      order: passages.slice(0, top).map((_, index) => index),
      usage: [{ kind: "rerank" as const, provider: "fake", model: "fake-reranker", units: passages.length, unit: "token" as const, costUsd: 0 }],
    };
  }
}
