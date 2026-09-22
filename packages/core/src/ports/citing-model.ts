import type { Usage } from "./usage";

/** One unit of text the model may cite. Every source belongs to exactly one page. */
export type Source = { id: string; title: string; text: string };

export type CitingModelEvent =
  /** A run of answer text and the ids of the sources it cites. Empty `sourceIds` means uncited. */
  | { type: "text"; text: string; sourceIds: string[] }
  | { type: "usage"; usage: Usage };

/**
 * Answers a question from sources and says which sources support each piece of text.
 * A provider without native citations must emulate them inside its adapter (ADR-0003).
 */
export interface CitingModel {
  answer(input: {
    instructions: string;
    sources: Source[];
    question: string;
    /** Ask the provider to cache the sources for follow-up questions. */
    cacheSources: boolean;
  }): AsyncIterable<CitingModelEvent>;
}
