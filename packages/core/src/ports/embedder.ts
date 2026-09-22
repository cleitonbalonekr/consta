import type { Metered } from "./usage";

/** Turns text into vectors. Passages and questions are embedded differently. */
export interface Embedder {
  readonly model: string;
  readonly dimensions: number;
  embed(texts: string[], as: "passage" | "question"): Promise<Metered<{ vectors: number[][] }>>;
}
