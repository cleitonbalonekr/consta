import type { Metering } from "../metering";
import type { CitingModel, Embedder, Reranker, UnitOfWork } from "../ports";
import { NotImplemented } from "../shared";
import type { Box, CaseFileId, LawyerId, PecaId, QuestionId, QuickAction } from "../shared";

export type Scope = { kind: "whole-file" } | { kind: "peca"; pecaId: PecaId };

export type QuestionInput =
  | { caseFileId: CaseFileId; scope: Scope; text: string }
  | { caseFileId: CaseFileId; quickAction: QuickAction };

export type Citation = {
  page: number;
  /** The court-stamped "fls." number, when the page has one. */
  folha: string | null;
  quote: string;
  boxes: Box[];
};

/** One claim in an answer. Never shown without a citation, so the type requires one. */
export type Statement = { text: string; citations: [Citation, ...Citation[]] };

export type AnswerEvent =
  | { type: "statement"; statement: Statement }
  | { type: "refused"; reason: "not-ready" | "scope-too-large" }
  /** `dropped` counts the statements removed because they had no citation. */
  | { type: "done"; questionId: QuestionId; dropped: number };

/**
 * Answers a lawyer's question about one case file. Statements stream one at a
 * time, each only after its citations are known (ADR-0003).
 */
export interface Answering {
  /** Throws NotFound if the lawyer doesn't own the case file. */
  ask(lawyer: LawyerId, question: QuestionInput): AsyncIterable<AnswerEvent>;
}

export type AnsweringDeps = {
  uow: UnitOfWork;
  embedder: Embedder;
  reranker: Reranker;
  model: CitingModel;
  metering: Metering;
};

export function createAnswering(_deps: AnsweringDeps): Answering {
  return {
    // eslint-disable-next-line require-yield
    async *ask() {
      throw new NotImplemented("Answering.ask");
    },
  };
}
