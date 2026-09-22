import type { FactKind, PecaType } from "../shared";
import type { Metered } from "./usage";

export type PecaDraft = {
  type: PecaType;
  title: string;
  /** ISO date, when the peça shows one. */
  date: string | null;
  firstPage: number;
  lastPage: number;
  summary: string;
};

export type FactDraft = {
  kind: FactKind;
  value: string;
  normalizedValue: string | null;
  context: string;
  page: number;
};

/**
 * Reads a window of consecutive pages and returns the peças and facts in it.
 * Ingestion slides the window and merges peças that cross a window edge.
 */
export interface MapExtractor {
  extract(input: {
    pages: { page: number; text: string }[];
    /** The last peça of the previous window, so a peça that continues can be extended. */
    openPeca: PecaDraft | null;
  }): Promise<Metered<{ pecas: PecaDraft[]; facts: FactDraft[] }>>;
}
