import type { Metering } from "../metering";
import type { CitingModel, Embedder, FactDraft, Reranker, Source, UnitOfWork } from "../ports";
import { NotFound, PageRange, QuestionId } from "../shared";
import type { UnreadPages } from "../case-files";
import type { Block } from "../ingestion";
import type { Box, CaseFileId, CaseFileStatus, FactKind, LawyerId, PageSource, PecaId, QuickAction } from "../shared";
import { RankFusion } from "./rank-fusion";
import { StatementBuilder } from "./statements";
import type { FoundPassage, ReadPassage } from "./statements";

export type { FoundPassage } from "./statements";

/** The two rankings of a hybrid search, each best first. */
export type RankedPassages = { byVector: FoundPassage[]; byText: FoundPassage[] };

export type Scope = { kind: "whole-file" } | { kind: "peca"; pecaId: PecaId };

/** A question in one scope. A peça summary becomes one, with PECA_SUMMARY_TEXT as its text. */
export type ScopedQuestion = { caseFileId: CaseFileId; scope: Scope; text: string };

export type QuestionInput =
  | ScopedQuestion
  /** The summary of one peça: a question about the peça whose text is PECA_SUMMARY_TEXT; the model is asked PECA_SUMMARY_PROMPT. */
  | { caseFileId: CaseFileId; summarize: PecaId }
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
  | { type: "refused"; reason: Refusal | "declined" }
  /**
   * `dropped` counts the statements removed because they had no citation. `unreadPages` names the
   * scanned pages of a peça that the answer could not read (ADR-0010); it is empty for a whole-file
   * question, whose unread pages the case file shows.
   */
  | { type: "done"; questionId: QuestionId; dropped: number; unreadPages: UnreadPages };

/**
 * Why a question is refused before the model is called: the case file is not ready, the peça
 * is over PECA_CHAR_BUDGET, or every page of the peça is scanned.
 */
export type Refusal = "not-ready" | "scope-too-large" | "not-readable";

/** One page of a peça, as a question about the peça reads it. A scanned page has no blocks (ADR-0010). */
export type PecaPage = { page: number; folha: string | null; source: PageSource; blocks: Block[] };

/**
 * A page a statement can cite: a digital page with a block. A scanned page is not read (ADR-0010),
 * and a digital page with an empty text layer has nothing to cite.
 */
function isCitable(page: PecaPage) {
  return page.source === "digital" && page.blocks.length > 0;
}

/** A fact recorded at ingestion, with the folha of its page, as a quick action reads it. */
export type PageFact = FactDraft & { folha: string | null };

/** A question and its answer, as the Answering repository stores it. */
export type QuestionRecord = {
  id: QuestionId;
  caseFileId: CaseFileId;
  lawyer: LawyerId;
  scope: Scope;
  /** Set for a quick action, whose scope is the whole case file. */
  quickAction: QuickAction | null;
  text: string;
  answer: Statement[];
  dropped: number;
};

/** Answering's reads and writes, behind a port so the module holds no SQL (ADR-0006). */
export interface AnsweringRepository {
  /** The case file's status, or null when it does not exist or another lawyer owns it. */
  caseFileStatus(lawyer: LawyerId, caseFileId: CaseFileId): Promise<CaseFileStatus | null>;
  /**
   * Both rankings of the hybrid search over the case file's passages, in one query: the
   * `depth` nearest to the embedding, and the `depth` best Portuguese full-text matches for
   * any word of the text. Each passage comes with its page's folha and its boxes. Answering
   * fuses the two.
   */
  search(caseFileId: CaseFileId, query: { text: string; embedding: number[] }, depth: number): Promise<RankedPassages>;
  /**
   * The characters of text on the pages of the peça's page range, so Answering can refuse a
   * peça too large to read before it loads the pages. Null when the case file has no such peça.
   */
  pecaSize(caseFileId: CaseFileId, pecaId: PecaId): Promise<{ chars: number } | null>;
  /** The pages of the peça's page range, in page order. Empty when the case file has no such peça. */
  pecaPages(caseFileId: CaseFileId, pecaId: PecaId): Promise<PecaPage[]>;
  /** The case file's facts of these kinds, in page order, and by value on one page. */
  facts(caseFileId: CaseFileId, kinds: readonly FactKind[]): Promise<PageFact[]>;
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

/**
 * Characters of page text a peça question reads at most: about 150,000 tokens of Portuguese
 * (prd-mvp.md, F6), at about three characters a token, as Ingestion's map windows count.
 */
export const PECA_CHAR_BUDGET = 450_000;

/** The text of a peça summary as the lawyer sees it, and as the question is saved. */
export const PECA_SUMMARY_TEXT = "Resumo da peça";

/** What the model is asked for a peça summary (prd-mvp.md, F8). */
export const PECA_SUMMARY_PROMPT =
  "Resuma esta peça em poucos parágrafos curtos: quem a apresenta, o que pede ou decide, os fundamentos e as conclusões. Escreva cada parágrafo em uma única linha.";

/** What each quick action reads, what the lawyer sees and the question saves, and what the model is asked (prd-mvp.md, question types). */
export const QUICK_ACTIONS: Record<QuickAction, { kinds: readonly FactKind[]; text: string; prompt: string }> = {
  timeline: {
    kinds: ["date", "event"],
    text: "Linha do tempo",
    prompt: "Liste em ordem cronológica todas as datas e todos os acontecimentos dos autos, um por linha, cada um com a sua data quando houver.",
  },
  people: {
    kinds: ["person", "role"],
    text: "Pessoas",
    prompt: "Liste todas as pessoas envolvidas nos autos, uma por linha, cada uma com o seu papel no processo quando houver.",
  },
  amounts: {
    kinds: ["amount"],
    text: "Valores",
    prompt: "Liste todos os valores em dinheiro dos autos, um por linha, cada um com o que ele representa.",
  },
};

const ANSWER_FORM = [
  "Write in Brazilian Portuguese. Write one statement per line: one claim, supported by the sources it cites.",
  "Write no headings, no introduction and no closing remark. If the sources do not answer the question, write nothing.",
];

const WHOLE_FILE_INSTRUCTIONS = [
  "You answer a Brazilian lawyer's question about one case file (autos processuais), using only the sources given.",
  "Each source is a passage from one page of the case file; its title names the page and, when there is one, the folha.",
  ...ANSWER_FORM,
].join("\n");

// The same for every question about any peça, so a follow-up reads the cached prefix.
const PECA_INSTRUCTIONS = [
  "You answer a Brazilian lawyer's question about one peça (one document, such as a petição or a sentença) of a case file (autos processuais), using only the sources given.",
  "Each source is one full page of the peça, in page order; its title names the page and, when there is one, the folha.",
  ...ANSWER_FORM,
].join("\n");

// The same for every quick action; the prompt says which list to write.
const FACT_INSTRUCTIONS = [
  "You write a complete list for a Brazilian lawyer about one case file (autos processuais), using only the sources given.",
  "Each source is one fact recorded from one page of the case file: the fact as written, its normalized form in parentheses when it has one, and what it is about. Its title names the page and, when there is one, the folha.",
  "Leave out no source that fits the list. When several sources state the same fact, write it once and cite them all.",
  ...ANSWER_FORM,
].join("\n");

/**
 * What the model reads for a question: the passages, the instructions that describe them, and
 * whether to cache them. `prompt` is what the model is asked: the lawyer's text, or a preset's.
 */
type Reading = { instructions: string; passages: ReadPassage[]; cacheSources: boolean; prompt: string; unreadPages: UnreadPages };

/** A question as Answering saves it. */
type AskedQuestion = ScopedQuestion & { quickAction: QuickAction | null };

/** What a question reads: passages that search finds, the pages of its peça, or the facts of a quick action. */
type Material = { from: "search" } | { from: "peca"; pages: PecaPage[] } | { from: "facts"; facts: PageFact[] };

/** A question checked and ready to answer: what it is, what the model is asked, and what it reads. */
type Prepared = { question: AskedQuestion; prompt: string; material: Material };

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
   * Yields `refused` with the Refusal when the question can't be answered: a case file that is
   * not ready, a peça over PECA_CHAR_BUDGET, or a peça with no page to cite (scanned pages, or
   * digital pages with no text). Otherwise yields each cited statement as soon as its line ends,
   * saves the question, and yields `done` last.
   * When the model declines part way, yields `refused: "declined"` last and saves nothing. Throws
   * NotFound if the lawyer doesn't own the case file, or the case file has no such peça.
   * A quick action reads the facts of its kinds instead of searching, and a case file with none
   * gets an answer with no statement.
   */
  async *ask(lawyer: LawyerId, input: QuestionInput): AsyncIterable<AnswerEvent> {
    // One run, so the peça is read from the case file whose owner was just checked.
    const prepared = await this.uow.run((repos) => this.prepare(repos.answering, lawyer, input));
    if (typeof prepared === "string") {
      yield { type: "refused", reason: prepared };
      return;
    }
    const { question, prompt, material } = prepared;
    yield* this.answer(lawyer, question, await this.reading(lawyer, question.caseFileId, prompt, material));
  }

  private async reading(lawyer: LawyerId, caseFileId: CaseFileId, prompt: string, material: Material): Promise<Reading> {
    if (material.from === "peca") return this.pecaReading(material.pages, prompt);
    if (material.from === "facts") return this.factReading(material.facts, prompt);
    const passages = await this.searchPassages(lawyer, caseFileId, prompt);
    return { instructions: WHOLE_FILE_INSTRUCTIONS, passages, cacheSources: false, prompt, unreadPages: [] };
  }

  /** Checks the question, and reads the peça's pages when it is about one peça. */
  private async prepare(repo: AnsweringRepository, lawyer: LawyerId, input: QuestionInput): Promise<Prepared | Refusal> {
    const { caseFileId } = input;
    const status = await repo.caseFileStatus(lawyer, caseFileId);
    // Ownership first, so another lawyer's case file is NotFound whatever the scope.
    if (status === null) throw new NotFound(`Case file ${caseFileId} not found.`);
    if (status !== "ready") return "not-ready";

    if ("quickAction" in input) {
      const { kinds, text, prompt } = QUICK_ACTIONS[input.quickAction];
      const question = { caseFileId, scope: { kind: "whole-file" } as const, quickAction: input.quickAction, text };
      return { question, prompt, material: { from: "facts", facts: await repo.facts(caseFileId, kinds) } };
    }
    const summary = "summarize" in input;
    const scoped: ScopedQuestion = summary ? { caseFileId, scope: { kind: "peca", pecaId: input.summarize }, text: PECA_SUMMARY_TEXT } : input;
    const question = { ...scoped, quickAction: null };
    const prompt = summary ? PECA_SUMMARY_PROMPT : input.text;
    if (question.scope.kind === "whole-file") return { question, prompt, material: { from: "search" } };
    const pages = await this.pecaPages(repo, caseFileId, question.scope.pecaId);
    return typeof pages === "string" ? pages : { question, prompt, material: { from: "peca", pages } };
  }

  /**
   * The pages of the peça's page range. The size comes first, so a peça over the budget is never
   * loaded. Throws NotFound when the case file has no such peça.
   */
  private async pecaPages(repo: AnsweringRepository, caseFileId: CaseFileId, pecaId: PecaId): Promise<PecaPage[] | Refusal> {
    const size = await repo.pecaSize(caseFileId, pecaId);
    if (size === null) throw new NotFound(`Peça ${pecaId} not found.`);
    if (size.chars > PECA_CHAR_BUDGET) return "scope-too-large";
    const pages = await repo.pecaPages(caseFileId, pecaId);
    return pages.some(isCitable) ? pages : "not-readable";
  }

  /** The citable pages of the peça, one passage per page and one block per line, cached for follow-up questions. */
  private pecaReading(pages: PecaPage[], prompt: string): Reading {
    const citable = pages.filter(isCitable);
    const passages = citable.map(({ page, folha, blocks }) => ({
      id: `page-${page}`,
      page,
      folha,
      blocks: blocks.map(({ text, box }) => ({ text, boxes: [box] })),
    }));
    const unreadPages = PageRange.group(pages.filter((page) => page.source === "scanned").map((page) => page.page));
    return { instructions: PECA_INSTRUCTIONS, passages, cacheSources: true, prompt, unreadPages };
  }

  /**
   * One passage per fact, of one block, so a citation of it names its page. A fact has no boxes:
   * the viewer opens its page with nothing marked.
   */
  private factReading(facts: PageFact[], prompt: string): Reading {
    const passages = facts.map(({ value, normalizedValue, context, page, folha }, index) => {
      const normalized = normalizedValue && normalizedValue !== value ? ` (${normalizedValue})` : "";
      return { id: `fact-${index}`, page, folha, blocks: [{ text: `${value}${normalized}, ${context}`, boxes: [] }] };
    });
    return { instructions: FACT_INSTRUCTIONS, passages, cacheSources: false, prompt, unreadPages: [] };
  }

  /** Streams the statements of the answer, then saves the question. */
  private async *answer(lawyer: LawyerId, question: AskedQuestion, reading: Reading): AsyncIterable<AnswerEvent> {
    const { caseFileId, scope, quickAction, text } = question;
    const builder = new StatementBuilder(new Map(reading.passages.map((passage) => [passage.id, passage])));
    const answer: Statement[] = [];
    for await (const statement of this.statements(lawyer, caseFileId, reading, builder)) {
      if (statement === "declined") {
        yield { type: "refused", reason: "declined" };
        return;
      }
      answer.push(statement);
      yield { type: "statement", statement };
    }

    const id = QuestionId(crypto.randomUUID());
    await this.uow.run((repos) => repos.answering.saveQuestion({ id, caseFileId, lawyer, scope, quickAction, text, answer, dropped: builder.dropped }));
    yield { type: "done", questionId: id, dropped: builder.dropped, unreadPages: reading.unreadPages };
  }

  /** The passages search finds, each as one block, so a citation of it shows the whole passage. */
  private async searchPassages(lawyer: LawyerId, caseFileId: CaseFileId, text: string): Promise<ReadPassage[]> {
    const found = await this.search(lawyer, caseFileId, text);
    return found.map(({ id, page, folha, text: passageText, boxes }) => ({ id, page, folha, blocks: [{ text: passageText, boxes }] }));
  }

  /** Embeds the question, runs the hybrid search, and keeps the passages the reranker puts first. */
  private async search(lawyer: LawyerId, caseFileId: CaseFileId, text: string): Promise<FoundPassage[]> {
    const embedded = await this.embedder.embed([text], "question");
    const embedding = embedded.vectors[0];
    if (!embedding) throw new Error("The embedder returned no vector for the question.");

    // The search does not wait on metering: it is on the path to the first statement.
    const [ranked] = await Promise.all([
      this.uow.run((repos) => repos.answering.search(caseFileId, { text, embedding }, SEARCH_DEPTH)),
      this.metering.record(lawyer, caseFileId, embedded.usage),
    ]);
    const found = this.fuse(ranked);
    if (found.length === 0) return [];
    const { order, usage } = await this.reranker.rerank(text, found.map((passage) => passage.text), PASSAGES_FOR_MODEL);
    await this.metering.record(lawyer, caseFileId, usage);
    return order.flatMap((index) => found[index] ?? []);
  }

  /**
   * With no passage to read, the model is not called: it could cite nothing. Ends with
   * "declined" when the model declines; the line it was writing is not finished.
   */
  private async *statements(lawyer: LawyerId, caseFileId: CaseFileId, reading: Reading, builder: StatementBuilder): AsyncIterable<Statement | "declined"> {
    const { instructions, passages, cacheSources, prompt: question } = reading;
    if (passages.length === 0) return;
    const sources = passages.map((passage) => this.source(passage));
    for await (const event of this.model.answer({ instructions, sources, question, cacheSources })) {
      if (event.type === "declined") {
        yield "declined";
        return;
      }
      if (event.type === "usage") await this.metering.record(lawyer, caseFileId, [event.usage]);
      else yield* builder.add(event.text, event.citations);
    }
    yield* builder.finish();
  }

  /** Reciprocal Rank Fusion of the two rankings, best first. */
  private fuse({ byVector, byText }: RankedPassages): FoundPassage[] {
    const byId = new Map([...byVector, ...byText].map((passage) => [passage.id, passage]));
    return RankFusion.fuse([byVector, byText].map((ranking) => ranking.map((passage) => passage.id))).map((id) => byId.get(id)!);
  }

  private source({ id, page, folha, blocks }: ReadPassage): Source {
    return { id, title: folha ? `Página ${page} (fls. ${folha})` : `Página ${page}`, blocks: blocks.map((block) => block.text) };
  }
}
