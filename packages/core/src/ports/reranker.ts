import type { Metered } from "./usage";

/** Orders passages by how well they answer a question. */
export interface Reranker {
  /** Returns indexes into `passages`, best first, at most `top` of them. */
  rerank(question: string, passages: string[], top: number): Promise<Metered<{ order: number[] }>>;
}
