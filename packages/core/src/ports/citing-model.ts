import type { Usage } from "./usage";

/** One unit of text the model may cite, in blocks it can cite one by one. Every source belongs to exactly one page. */
export type Source = { id: string; title: string; blocks: string[] };

/** The blocks of one source that a run of text cites, from `firstBlock` to `lastBlock`, both included. */
export type SourceCitation = { sourceId: string; firstBlock: number; lastBlock: number };

export type CitingModelEvent =
  /** A run of answer text and the source blocks it cites. Empty `citations` means uncited. */
  | { type: "text"; text: string; citations: SourceCitation[] }
  | { type: "usage"; usage: Usage }
  /** The provider declined to answer, after some text perhaps. Last, after the usage; the text before it is partial. */
  | { type: "declined" };

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
