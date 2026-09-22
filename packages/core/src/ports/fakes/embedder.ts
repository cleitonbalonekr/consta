import type { Embedder } from "../embedder";

/**
 * Deterministic vectors built from the words in the text, so texts that share
 * words land close together. Good enough to test retrieval plumbing, not quality.
 */
export class FakeEmbedder implements Embedder {
  readonly model = "fake-embedder";

  constructor(readonly dimensions = 1024) {}

  async embed(texts: string[], _as: "passage" | "question") {
    const vectors = texts.map((text) => this.vector(text));
    const tokens = texts.reduce((total, text) => total + text.split(/\s+/).length, 0);
    return {
      vectors,
      usage: [{ kind: "embed" as const, provider: "fake", model: this.model, units: tokens, unit: "token" as const, costUsd: 0 }],
    };
  }

  private vector(text: string) {
    const vector = new Array<number>(this.dimensions).fill(0);
    for (const word of text.toLowerCase().match(/\p{L}+/gu) ?? []) {
      vector[hash(word) % this.dimensions]! += 1;
    }
    const length = Math.hypot(...vector) || 1;
    return vector.map((value) => value / length);
  }
}

function hash(word: string) {
  let h = 2166136261;
  for (let i = 0; i < word.length; i++) {
    h ^= word.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
