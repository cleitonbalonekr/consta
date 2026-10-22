import type { Metering } from "../metering";
import type { CitingModel, Embedder, Reranker, Source, UnitOfWork } from "../ports";
import { NotFound, NotImplemented, QuestionId } from "../shared";
import type { Box, CaseFileId, CaseFileStatus, LawyerId, PecaId, QuickAction } from "../shared";
import { StatementBuilder } from "./statements";
import type { FoundPassage } from "./statements";

export { RankFusion } from "./rank-fusion";
export type { FoundPassage } from "./statements";

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
  /** `declined`: the model declined part way; the statements before it are partial, and the lawyer is shown none. */
  | { type: "refused"; reason: "not-ready" | "scope-too-large" | "declined" }
  /** `dropped` counts the statements removed because they had no citation. */
  | { type: "done"; questionId: QuestionId; dropped: number };

/** A question and its answer, as the Answering repository stores it. Tickets 10 and 11 add the peça and quick action scopes. */
export type QuestionRecord = {
  id: QuestionId;
  caseFileId: CaseFileId;
  lawyer: LawyerId;
  scope: "whole-file";
  text: string;
  answer: Statement[];
  dropped: number;
};

/** Answering's reads and writes, behind a port so the module holds no SQL (ADR-0006). */
export interface AnsweringRepository {
  /** The case file's status, or null when it does not exist or another lawyer owns it. */
  caseFileStatus(lawyer: LawyerId, caseFileId: CaseFileId): Promise<CaseFileStatus | null>;
  /**
   * Hybrid search over the case file's passages: the `depth` nearest to the embedding and
   * the `depth` best Portuguese full-text matches for the text, fused by Reciprocal Rank
   * Fusion (RankFusion), best first. Each passage comes with its page's folha and its boxes.
   */
  search(caseFileId: CaseFileId, query: { text: string; embedding: number[] }, depth: number): Promise<FoundPassage[]>;
  saveQuestion(question: QuestionRecord): Promise<void>;
}

export type AnsweringDeps = {
  uow: UnitOfWork;
  embedder: Embedder;
  reranker: Reranker;
  model: CitingModel;
  metering: Metering;
};

/** Passages each search takes from the vector index and from the full-text index (prd-mvp.md, question types). */
export const SEARCH_DEPTH = 50;

/** Passages the reranker keeps and the model reads. */
export const PASSAGES_FOR_MODEL = 20;

const INSTRUCTIONS = [
  "You answer a Brazilian lawyer's question about one case file (autos processuais), using only the sources given.",
  "Each source is a passage from one page of the case file; its title names the page and, when there is one, the folha.",
  "Write in Brazilian Portuguese. Write one statement per line: one claim, supported by the sources it cites.",
  "Write no headings, no introduction and no closing remark. If the sources do not answer the question, write nothing.",
].join("\n");

/**
 * Answers a lawyer's question about one case file. Statements stream one at a time,
 * each only after its citations are known (ADR-0003).
 */
export class Answering {
  private readonly uow: UnitOfWork;
  private readonly embedder: Embedder;
  private readonly reranker: Reranker;
  private readonly model: CitingModel;
  private readonly metering: Metering;

  constructor({ uow, embedder, reranker, model, metering }: AnsweringDeps) {
    this.uow = uow;
    this.embedder = embedder;
    this.reranker = reranker;
    this.model = model;
    this.metering = metering;
  }

  /**
   * Yields `refused: "not-ready"` for a case file that is not ready. Otherwise yields each
   * cited statement as soon as its line ends, saves the question, and yields `done` last.
   * When the model declines part way, yields `refused: "declined"` last and saves nothing.
   * Throws NotFound if the lawyer doesn't own the case file. Tickets 10 and 11 add the peça
   * scope and the quick actions; until then they throw NotImplemented.
   */
  async *ask(lawyer: LawyerId, question: QuestionInput): AsyncIterable<AnswerEvent> {
    const { caseFileId } = question;
    const status = await this.uow.run((repos) => repos.answering.caseFileStatus(lawyer, caseFileId));
    // Ownership first, so another lawyer's case file is NotFound whatever the scope.
    if (status === null) throw new NotFound(`Case file ${caseFileId} not found.`);
    if (!("scope" in question) || question.scope.kind !== "whole-file") throw new NotImplemented("Answering.ask for a peça or a quick action");
    if (status !== "ready") {
      yield { type: "refused", reason: "not-ready" };
      return;
    }

    const { text } = question;
    const passages = await this.search(lawyer, caseFileId, text);
    const builder = new StatementBuilder(new Map(passages.map((passage) => [passage.id, passage])));
    const answer: Statement[] = [];
    for await (const statement of this.statements(lawyer, caseFileId, text, passages, builder)) {
      if (statement === "declined") {
        yield { type: "refused", reason: "declined" };
        return;
      }
      answer.push(statement);
      yield { type: "statement", statement };
    }

    const id = QuestionId(crypto.randomUUID());
    await this.uow.run((repos) => repos.answering.saveQuestion({ id, caseFileId, lawyer, scope: "whole-file", text, answer, dropped: builder.dropped }));
    yield { type: "done", questionId: id, dropped: builder.dropped };
  }

  /** Embeds the question, runs the hybrid search, and keeps the passages the reranker puts first. */
  private async search(lawyer: LawyerId, caseFileId: CaseFileId, text: string): Promise<FoundPassage[]> {
    const embedded = await this.embedder.embed([text], "question");
    const embedding = embedded.vectors[0];
    if (!embedding) throw new Error("The embedder returned no vector for the question.");

    // The search does not wait on metering: it is on the path to the first statement.
    const [found] = await Promise.all([
      this.uow.run((repos) => repos.answering.search(caseFileId, { text, embedding }, SEARCH_DEPTH)),
      this.metering.record(lawyer, caseFileId, embedded.usage),
    ]);
    if (found.length === 0) return [];
    const { order, usage } = await this.reranker.rerank(text, found.map((passage) => passage.text), PASSAGES_FOR_MODEL);
    await this.metering.record(lawyer, caseFileId, usage);
    return order.flatMap((index) => found[index] ?? []);
  }

  /**
   * With no passage to read, the model is not called: it could cite nothing. Ends with
   * "declined" when the model declines; the line it was writing is not finished.
   */
  private async *statements(lawyer: LawyerId, caseFileId: CaseFileId, question: string, passages: FoundPassage[], builder: StatementBuilder): AsyncIterable<Statement | "declined"> {
    if (passages.length === 0) return;
    const sources = passages.map((passage) => this.source(passage));
    for await (const event of this.model.answer({ instructions: INSTRUCTIONS, sources, question, cacheSources: false })) {
      if (event.type === "declined") {
        yield "declined";
        return;
      }
      if (event.type === "usage") await this.metering.record(lawyer, caseFileId, [event.usage]);
      else yield* builder.add(event.text, event.sourceIds);
    }
    yield* builder.finish();
  }

  private source({ id, page, folha, text }: FoundPassage): Source {
    return { id, title: folha ? `Página ${page} (fls. ${folha})` : `Página ${page}`, text };
  }
}
