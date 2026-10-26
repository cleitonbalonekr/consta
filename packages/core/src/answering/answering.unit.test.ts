import { describe, expect, it } from "vitest";
import type { CitingModel, CitingModelEvent, FactDraft, Source, SourceCitation } from "../ports";
import { FakeCitingModel, FakeMapExtractor, FakeReranker, InMemoryUnitOfWork } from "../ports/fakes";
import { LawyerId, NotFound, PecaId } from "../shared";
import type { CaseFileId, FactKind, QuickAction } from "../shared";
import { PASSAGES_FOR_MODEL, PECA_CHAR_BUDGET, PECA_SUMMARY_PROMPT } from "./index";
import type { AnswerEvent, Statement } from "./index";
import { answeringOn, sourceOn } from "./testing";

type Line = { text: string; sourceIds?: string[]; citations?: SourceCitation[] };

async function setup(options: Parameters<typeof answeringOn>[1] = {}) {
  const uow = new InMemoryUnitOfWork();
  const lawyer = LawyerId(crypto.randomUUID());
  const built = answeringOn(uow, options);
  await built.metering.startTrial(lawyer);
  const passageOn = (caseFileId: CaseFileId, page: number) => {
    const passage = uow.state.ingestion.passages.find((stored) => stored.caseFileId === caseFileId && stored.page === page)!;
    const stored = uow.state.ingestion.pages.find((record) => record.caseFileId === caseFileId && record.number === page)!;
    return { quote: passage.text, boxes: passage.blockIndexes.map((index) => stored.blocks[index]!.box) };
  };
  return { ...built, uow, lawyer, passageOn };
}

const statements = (events: AnswerEvent[]): Statement[] => events.flatMap((event) => (event.type === "statement" ? [event.statement] : []));

/** A model that answers with the lines a script picks from the sources. */
const scripted = (script: (sources: Source[]) => Line[]) => new FakeCitingModel(({ sources }) => script(sources));

describe("Answering.ask about the whole case file", () => {
  it("streams one statement per line, each citation naming the page, folha, quote and boxes of its passage", async () => {
    const model = scripted((sources) => [
      { text: "A autora pede indenização por danos morais.\n", sourceIds: [sourceOn(sources, 2).id] },
      { text: "O réu é o Banco Exemplo.", sourceIds: [sourceOn(sources, 3).id, sourceOn(sources, 1).id] },
    ]);
    const { ingest, ask, lawyer, passageOn } = await setup({ model });
    const caseFileId = await ingest(lawyer, ["digital", "digital", "digital"]);

    const events = await ask(lawyer, caseFileId);

    expect(statements(events)).toEqual([
      { text: "A autora pede indenização por danos morais.", citations: [{ page: 2, folha: "3", ...passageOn(caseFileId, 2) }] },
      {
        text: "O réu é o Banco Exemplo.",
        citations: [
          { page: 3, folha: "4", ...passageOn(caseFileId, 3) },
          { page: 1, folha: "2", ...passageOn(caseFileId, 1) },
        ],
      },
    ]);
    expect(passageOn(caseFileId, 2).quote).toContain("Página 2: MARIA APARECIDA SOUZA");
    expect(events.at(-1)).toEqual({ type: "done", questionId: expect.any(String), dropped: 0, unreadPages: [] });
  });

  it("drops every line without a citation, counts it, and saves the question with what was shown", async () => {
    const model = scripted((sources) => [
      { text: "Segundo os autos:\n", sourceIds: [] },
      { text: "A ação é de indenização.\n", sourceIds: [sourceOn(sources, 1).id] },
      { text: "O juiz deve julgar procedente.\n", sourceIds: [] },
    ]);
    const { ingest, ask, lawyer, uow } = await setup({ model });
    const caseFileId = await ingest(lawyer, ["digital"]);

    const events = await ask(lawyer, caseFileId, "Do que trata esta ação?");

    expect(statements(events).map((statement) => statement.text)).toEqual(["A ação é de indenização."]);
    const done = events.at(-1)!;
    expect(done).toMatchObject({ type: "done", dropped: 2 });
    expect(uow.state.answering.questions).toEqual([
      {
        id: done.type === "done" ? done.questionId : "",
        caseFileId,
        lawyer,
        scope: { kind: "whole-file" },
        quickAction: null,
        text: "Do que trata esta ação?",
        answer: statements(events),
        dropped: 2,
      },
    ]);
  });

  it("joins the runs of one line, so one cited run makes the whole line a statement, and removes list markers", async () => {
    const model = scripted((sources) => [
      { text: "- A sentença ", sourceIds: [] },
      { text: "condenou o réu", sourceIds: [sourceOn(sources, 1).id] },
      { text: ".\n\n", sourceIds: [] },
      { text: "2. Houve recurso.", sourceIds: [sourceOn(sources, 1).id] },
    ]);
    const { ingest, ask, lawyer } = await setup({ model });
    const caseFileId = await ingest(lawyer, ["digital"]);

    const events = await ask(lawyer, caseFileId);

    expect(statements(events).map((statement) => [statement.text, statement.citations.map((citation) => citation.page)])).toEqual([
      ["A sentença condenou o réu.", [1]],
      ["Houve recurso.", [1]],
    ]);
    expect(events.at(-1)).toMatchObject({ dropped: 0 });
  });

  it("ignores a cited id that names no passage it sent, so a line citing only that is dropped", async () => {
    const model = scripted(() => [{ text: "Afirmação inventada.", sourceIds: ["not-a-passage"] }]);
    const { ingest, ask, lawyer } = await setup({ model });
    const caseFileId = await ingest(lawyer, ["digital"]);

    const events = await ask(lawyer, caseFileId);

    expect(statements(events)).toEqual([]);
    expect(events.at(-1)).toMatchObject({ dropped: 1 });
  });

  it("yields a statement as soon as its line ends, before the model finishes", async () => {
    let finish!: () => void;
    const finished = new Promise<void>((resolve) => (finish = resolve));
    const model: CitingModel = {
      async *answer({ sources }): AsyncIterable<CitingModelEvent> {
        yield { type: "text", text: "Primeira afirmação.\n", citations: [{ sourceId: sources[0]!.id, firstBlock: 0, lastBlock: 0 }] };
        await finished;
        yield { type: "text", text: "Segunda afirmação.", citations: [{ sourceId: sources[0]!.id, firstBlock: 0, lastBlock: 0 }] };
      },
    };
    const { ingest, answering, lawyer } = await setup({ model });
    const caseFileId = await ingest(lawyer, ["digital"]);

    const events = answering.ask(lawyer, { caseFileId, scope: { kind: "whole-file" }, text: "O que houve?" })[Symbol.asyncIterator]();

    expect((await events.next()).value).toMatchObject({ type: "statement", statement: { text: "Primeira afirmação." } });
    finish();
    expect((await events.next()).value).toMatchObject({ type: "statement", statement: { text: "Segunda afirmação." } });
  });

  it("refuses as declined when the model declines part way, keeps the usage, and saves nothing", async () => {
    const model: CitingModel = {
      async *answer({ sources }): AsyncIterable<CitingModelEvent> {
        yield { type: "text", text: "Primeira afirmação.\nSegunda", citations: [{ sourceId: sources[0]!.id, firstBlock: 0, lastBlock: 0 }] };
        yield { type: "usage", usage: { kind: "answer", provider: "fake", model: "fake-citing-model", units: 10, unit: "token", costUsd: 0 } };
        yield { type: "declined" };
      },
    };
    const { ingest, ask, lawyer, uow } = await setup({ model });
    const caseFileId = await ingest(lawyer, ["digital"]);
    const before = uow.state.metering.usage.length;

    const events = await ask(lawyer, caseFileId);

    expect(events.map((event) => event.type)).toEqual(["statement", "refused"]);
    expect(events.at(-1)).toEqual({ type: "refused", reason: "declined" });
    expect(uow.state.answering.questions).toEqual([]);
    expect(uow.state.metering.usage.slice(before).map((event) => event.kind)).toEqual(["embed", "rerank", "answer"]);
  });

  it(`sends the model the ${PASSAGES_FOR_MODEL} passages the reranker puts first, each titled with its page and folha`, async () => {
    const model = new FakeCitingModel();
    // Reverses the order, so the test sees that the reranker's order is the one used.
    const reranker = new FakeReranker();
    const reversing = { rerank: async (question: string, passages: string[], top: number) => {
      const { usage } = await reranker.rerank(question, passages, top);
      return { order: passages.map((_, index) => passages.length - 1 - index).slice(0, top), usage };
    } };
    const { ingest, ask, lawyer } = await setup({ model, reranker: reversing });
    const caseFileId = await ingest(lawyer, Array.from({ length: 30 }, () => "digital" as const));

    await ask(lawyer, caseFileId, "Quem é a autora?");

    const [call] = model.calls;
    expect(call!.question).toBe("Quem é a autora?");
    expect(call!.cacheSources).toBe(false);
    expect(call!.sources).toHaveLength(PASSAGES_FOR_MODEL);
    expect(call!.sources[0]!.title).toMatch(/^Página \d+ \(fls\. \d+\)$/);
  });

  it("records the embedding, rerank and answer usage against the case file", async () => {
    const { ingest, ask, lawyer, uow } = await setup();
    const caseFileId = await ingest(lawyer, ["digital"]);
    const before = uow.state.metering.usage.length;

    await ask(lawyer, caseFileId);

    const usage = uow.state.metering.usage.slice(before);
    expect(usage.map((event) => [event.kind, event.lawyer, event.caseFileId])).toEqual([
      ["embed", lawyer, caseFileId],
      ["rerank", lawyer, caseFileId],
      ["answer", lawyer, caseFileId],
    ]);
  });

  it("does not call the model when the search finds no passage, and saves an empty answer", async () => {
    const model = new FakeCitingModel();
    const { ingest, ask, lawyer, uow } = await setup({ model });
    const caseFileId = await ingest(lawyer, ["scanned"]);

    const events = await ask(lawyer, caseFileId);

    expect(events).toEqual([{ type: "done", questionId: expect.any(String), dropped: 0, unreadPages: [] }]);
    expect(model.calls).toEqual([]);
    expect(uow.state.answering.questions.map((question) => question.answer)).toEqual([[]]);
  });

  it("refuses a case file that is not ready, and saves nothing", async () => {
    const { caseFiles, lawyer, uow, answering } = await setup();
    const { caseFileId } = await caseFiles.startUpload(lawyer, { name: "Autos.pdf", bytes: 10, pages: 1 });

    const events: AnswerEvent[] = [];
    for await (const event of answering.ask(lawyer, { caseFileId, scope: { kind: "whole-file" }, text: "O que houve?" })) events.push(event);

    expect(events).toEqual([{ type: "refused", reason: "not-ready" }]);
    expect(uow.state.answering.questions).toEqual([]);
  });

  it("throws NotFound for another lawyer's case file", async () => {
    const { ingest, ask, lawyer } = await setup();
    const caseFileId = await ingest(lawyer, ["digital"]);

    await expect(ask(LawyerId(crypto.randomUUID()), caseFileId)).rejects.toThrow(NotFound);
  });

  it("throws NotFound for a peça or quick action question about another lawyer's case file", async () => {
    const { ingest, answering, lawyer } = await setup();
    const caseFileId = await ingest(lawyer, ["digital"]);
    const stranger = LawyerId(crypto.randomUUID());

    const first = (question: Parameters<typeof answering.ask>[1]) => answering.ask(stranger, question)[Symbol.asyncIterator]().next();

    await expect(first({ caseFileId, scope: { kind: "peca", pecaId: PecaId(crypto.randomUUID()) }, text: "?" })).rejects.toThrow(NotFound);
    await expect(first({ caseFileId, quickAction: "timeline" })).rejects.toThrow(NotFound);
  });

});

describe("Answering.ask for a quick action", () => {
  const fact = (kind: FactKind, value: string, page: number, normalizedValue: string | null = null): FactDraft => ({
    kind,
    value,
    normalizedValue,
    context: `sobre ${value}`,
    page,
  });
  // Out of page order, as windows and kinds mix them.
  const FACTS = [
    fact("event", "Citação do réu", 3),
    fact("person", "Maria Aparecida Souza", 1, "Maria Aparecida Souza"),
    fact("date", "10/03/2026", 1, "2026-03-10"),
    fact("amount", "R$ 10.000,00", 2, "10000.00"),
    fact("role", "Autora", 2),
    fact("date", "05/01/2026", 3, "2026-01-05"),
  ];

  /** A ready case file of three digital pages, whose map records FACTS. */
  async function withFacts(options: Parameters<typeof answeringOn>[1] = {}, facts = FACTS) {
    const mapExtractor = new FakeMapExtractor((input) => ({
      ...FakeMapExtractor.twoPagePecas(input),
      facts: facts.filter((draft) => input.pages.some((page) => page.page === draft.page)),
    }));
    const built = await setup({ ...options, mapExtractor });
    const caseFileId = await built.ingest(built.lawyer, ["digital", "digital", "digital"]);
    const run = (quickAction: QuickAction) => built.events(built.lawyer, { caseFileId, quickAction });
    return { ...built, caseFileId, run };
  }

  it.each([
    ["timeline", ["Página 1 (fls. 2): 10/03/2026 (2026-03-10), sobre 10/03/2026", "Página 3 (fls. 4): 05/01/2026 (2026-01-05), sobre 05/01/2026", "Página 3 (fls. 4): Citação do réu, sobre Citação do réu"]],
    ["people", ["Página 1 (fls. 2): Maria Aparecida Souza, sobre Maria Aparecida Souza", "Página 2 (fls. 3): Autora, sobre Autora"]],
    ["amounts", ["Página 2 (fls. 3): R$ 10.000,00 (10000.00), sobre R$ 10.000,00"]],
  ] as const)("the %s reads only its kinds of fact, one source each, labelled with its page, in page order", async (quickAction, expected) => {
    const model = new FakeCitingModel();
    const { run, uow } = await withFacts({ model });
    const before = uow.state.metering.usage.length;

    await run(quickAction);

    const [call] = model.calls;
    expect(call!.sources.map((source) => `${source.title}: ${source.blocks.join(" | ")}`)).toEqual(expected);
    expect(call!.cacheSources).toBe(false);
    // No search: the facts are read, not embedded or reranked.
    expect(uow.state.metering.usage.slice(before).map((event) => event.kind)).toEqual(["answer"]);
  });

  it("cites the page of each fact, drops the uncited lines, and saves the question as a whole-file quick action", async () => {
    const model = scripted((sources) => [
      { text: "- 05/01/2026: o réu foi citado.\n", sourceIds: [sources[1]!.id, sources[2]!.id] },
      { text: "- 10/03/2026: a ação foi proposta.\n", sourceIds: [sources[0]!.id] },
      { text: "Esses são os fatos dos autos.\n", sourceIds: [] },
    ]);
    const { run, uow, caseFileId, lawyer } = await withFacts({ model });

    const events = await run("timeline");

    const onPage3 = { page: 3, folha: "4", boxes: [] };
    expect(statements(events)).toEqual([
      {
        text: "05/01/2026: o réu foi citado.",
        citations: [
          { ...onPage3, quote: "05/01/2026 (2026-01-05), sobre 05/01/2026" },
          { ...onPage3, quote: "Citação do réu, sobre Citação do réu" },
        ],
      },
      { text: "10/03/2026: a ação foi proposta.", citations: [{ page: 1, folha: "2", quote: "10/03/2026 (2026-03-10), sobre 10/03/2026", boxes: [] }] },
    ]);
    const done = events.at(-1)!;
    expect(done).toEqual({ type: "done", questionId: expect.any(String), dropped: 1, unreadPages: [] });
    expect(uow.state.answering.questions).toEqual([
      {
        id: done.type === "done" ? done.questionId : "",
        caseFileId,
        lawyer,
        scope: { kind: "whole-file" },
        quickAction: "timeline",
        text: "Linha do tempo",
        answer: statements(events),
        dropped: 1,
      },
    ]);
  });

  it("answers nothing without calling the model when the case file has no fact of its kinds", async () => {
    const model = new FakeCitingModel();
    const { run } = await withFacts({ model }, [fact("person", "Maria Aparecida Souza", 1)]);

    const events = await run("amounts");

    expect(model.calls).toEqual([]);
    expect(events).toEqual([{ type: "done", questionId: expect.any(String), dropped: 0, unreadPages: [] }]);
  });

  it("refuses a case file that is not ready, and saves nothing", async () => {
    const { caseFiles, lawyer, uow, events } = await setup();
    const { caseFileId } = await caseFiles.startUpload(lawyer, { name: "Autos.pdf", bytes: 10, pages: 1 });

    expect(await events(lawyer, { caseFileId, quickAction: "people" })).toEqual([{ type: "refused", reason: "not-ready" }]);
    expect(uow.state.answering.questions).toEqual([]);
  });
});

describe("Answering.ask about one peça", () => {
  /** A ready case file of three digital pages; the fake map makes peças of pages 1–2 and page 3. */
  async function withPecas(options: Parameters<typeof answeringOn>[1] = {}) {
    const built = await setup(options);
    const caseFileId = await built.ingest(built.lawyer, ["digital", "digital", "digital"]);
    const [first, second] = await built.documentMap(built.lawyer, caseFileId);
    const ask = (pecaId: PecaId, text = "O que pede esta peça?") => built.events(built.lawyer, { caseFileId, scope: { kind: "peca", pecaId }, text });
    const pageOn = (page: number) => built.uow.state.ingestion.pages.find((stored) => stored.caseFileId === caseFileId && stored.number === page)!;
    return { ...built, caseFileId, pecas: [first!, second!] as const, ask, pageOn };
  }

  it("reads the full page range of the peça, one source per page in order, and asks to cache them", async () => {
    const model = new FakeCitingModel();
    const { ask, pecas, uow } = await withPecas({ model });
    const before = uow.state.metering.usage.length;

    await ask(pecas[0].id);

    const [call] = model.calls;
    expect(call!.sources.map((source) => source.title)).toEqual(["Página 1 (fls. 2)", "Página 2 (fls. 3)"]);
    expect(call!.sources[1]!.blocks).toContain("Página 2: MARIA APARECIDA SOUZA, brasileira, professora, vem propor a presente");
    expect(call!.cacheSources).toBe(true);
    // No search: the pages are read, not embedded or reranked.
    expect(uow.state.metering.usage.slice(before).map((event) => event.kind)).toEqual(["answer"]);
  });

  it("sends each page as one block per line, and cites only the lines the model names: their text and boxes", async () => {
    const model = scripted((sources) => [{ text: "A autora é professora.", citations: [{ sourceId: sourceOn(sources, 2).id, firstBlock: 1, lastBlock: 2 }] }]);
    const { ask, pecas, pageOn } = await withPecas({ model });

    const events = await ask(pecas[0].id);

    const { blocks } = pageOn(2);
    expect(sourceOn(model.calls[0]!.sources, 2).blocks).toEqual(blocks.map((block) => block.text));
    expect(statements(events)).toEqual([
      { text: "A autora é professora.", citations: [{ page: 2, folha: "3", quote: `${blocks[1]!.text}\n${blocks[2]!.text}`, boxes: [blocks[1]!.box, blocks[2]!.box] }] },
    ]);
  });

  it("makes the lines a statement cites on one page one citation, in page order, and ignores lines the page does not have", async () => {
    const model = scripted((sources) => {
      const page = sourceOn(sources, 1).id;
      return [
        { text: "A ação é de indenização ", citations: [{ sourceId: page, firstBlock: 3, lastBlock: 3 }] },
        { text: "contra o banco.", citations: [{ sourceId: page, firstBlock: 1, lastBlock: 1 }, { sourceId: page, firstBlock: 2, lastBlock: 99 }] },
      ];
    });
    const { ask, pecas, pageOn } = await withPecas({ model });

    const events = await ask(pecas[0].id);

    const { blocks } = pageOn(1);
    const cited = blocks.slice(1);
    expect(statements(events)).toEqual([
      {
        text: "A ação é de indenização contra o banco.",
        citations: [{ page: 1, folha: "2", quote: cited.map((block) => block.text).join("\n"), boxes: cited.map((block) => block.box) }],
      },
    ]);
  });

  it("sends a follow-up about the same peça the same instructions and sources, so the provider reads them from its cache", async () => {
    const model = new FakeCitingModel();
    const { ask, pecas } = await withPecas({ model });

    await ask(pecas[0].id, "Quem é a autora?");
    await ask(pecas[0].id, "Quem é o réu?");

    const [first, followUp] = model.calls;
    expect(followUp!.question).toBe("Quem é o réu?");
    expect(followUp!.instructions).toBe(first!.instructions);
    expect(followUp!.sources).toEqual(first!.sources);
    expect(followUp!.cacheSources).toBe(true);
  });

  it("saves the question with the peça scope and the peça", async () => {
    const { ask, pecas, uow, caseFileId, lawyer } = await withPecas();

    const events = await ask(pecas[1].id, "O que o réu contesta?");

    expect(uow.state.answering.questions).toEqual([
      {
        id: expect.any(String),
        caseFileId,
        lawyer,
        scope: { kind: "peca", pecaId: pecas[1].id },
        quickAction: null,
        text: "O que o réu contesta?",
        answer: statements(events),
        dropped: 1,
      },
    ]);
  });

  it("leaves the scanned pages out, as no statement can cite them, and names them when done", async () => {
    const model = new FakeCitingModel();
    const { ingest, documentMap, events, lawyer } = await setup({ model });
    const caseFileId = await ingest(lawyer, ["digital", "scanned"]);
    const [peca] = await documentMap(lawyer, caseFileId);

    const answer = await events(lawyer, { caseFileId, scope: { kind: "peca", pecaId: peca!.id }, text: "O que houve?" });

    expect(model.calls[0]!.sources.map((source) => source.title)).toEqual(["Página 1 (fls. 2)"]);
    expect(answer.at(-1)).toEqual({ type: "done", questionId: expect.any(String), dropped: 1, unreadPages: [{ first: 2, last: 2 }] });
  });

  it("refuses a peça whose pages are all scanned as not readable, without calling the model, and saves nothing", async () => {
    const model = new FakeCitingModel();
    const { ingest, documentMap, events, lawyer, uow } = await setup({ model });
    const caseFileId = await ingest(lawyer, ["scanned", "scanned", "digital"]);
    const [peca] = await documentMap(lawyer, caseFileId);

    expect(await events(lawyer, { caseFileId, summarize: peca!.id })).toEqual([{ type: "refused", reason: "not-readable" }]);
    expect(model.calls).toEqual([]);
    expect(uow.state.answering.questions).toEqual([]);
  });

  it(`answers a peça of ${PECA_CHAR_BUDGET} characters, and refuses a larger one as too large without calling the model`, async () => {
    const model = new FakeCitingModel();
    const { ask, pecas, pageOn, uow } = await withPecas({ model });
    pageOn(1).text = "a".repeat(PECA_CHAR_BUDGET - pageOn(2).text.length);

    expect((await ask(pecas[0].id)).at(-1)).toMatchObject({ type: "done" });

    pageOn(1).text += "a";
    expect(await ask(pecas[0].id)).toEqual([{ type: "refused", reason: "scope-too-large" }]);
    expect(model.calls).toHaveLength(1);
    expect(uow.state.answering.questions).toHaveLength(1);
  });

  it("refuses a peça whose digital pages have no text as not readable, without calling the model, and saves nothing", async () => {
    const model = new FakeCitingModel();
    const { ask, pecas, pageOn, uow } = await withPecas({ model });
    pageOn(1).blocks = [];
    pageOn(2).blocks = [];

    expect(await ask(pecas[0].id)).toEqual([{ type: "refused", reason: "not-readable" }]);
    expect(model.calls).toEqual([]);
    expect(uow.state.answering.questions).toEqual([]);
  });

  it("answers a peça from its one digital page with text when another has none", async () => {
    const model = new FakeCitingModel();
    const { ask, pecas, pageOn } = await withPecas({ model });
    pageOn(1).blocks = [];

    expect((await ask(pecas[0].id)).at(-1)).toMatchObject({ type: "done" });
    expect(model.calls[0]!.sources.map((source) => source.title)).toEqual(["Página 2 (fls. 3)"]);
  });

  it("refuses a case file that is not ready", async () => {
    const { caseFiles, events, lawyer } = await setup();
    const { caseFileId } = await caseFiles.startUpload(lawyer, { name: "Autos.pdf", bytes: 10, pages: 1 });

    expect(await events(lawyer, { caseFileId, scope: { kind: "peca", pecaId: PecaId(crypto.randomUUID()) }, text: "?" })).toEqual([
      { type: "refused", reason: "not-ready" },
    ]);
  });

  it("throws NotFound for a peça that is not in the case file", async () => {
    const { ask } = await withPecas();

    await expect(ask(PecaId(crypto.randomUUID()))).rejects.toThrow(NotFound);
  });
});

describe("Answering.ask for the summary of a peça", () => {
  it("asks the model the summary prompt over the peça's pages, streams cited paragraphs, and saves it as a peça question", async () => {
    const model = scripted((sources) => [
      { text: "A autora, professora, pede indenização por danos morais contra o banco.\n", sourceIds: [sourceOn(sources, 1).id] },
      { text: "Ela diz que o banco inscreveu seu nome no cadastro de inadimplentes.", sourceIds: [sourceOn(sources, 2).id] },
    ]);
    const { ingest, documentMap, events, lawyer, uow } = await setup({ model });
    const caseFileId = await ingest(lawyer, ["digital", "digital", "digital"]);
    const [peca] = await documentMap(lawyer, caseFileId);

    const answer = await events(lawyer, { caseFileId, summarize: peca!.id });

    expect(model.calls[0]!.question).toBe(PECA_SUMMARY_PROMPT);
    expect(model.calls[0]!.sources.map((source) => source.title)).toEqual(["Página 1 (fls. 2)", "Página 2 (fls. 3)"]);
    expect(model.calls[0]!.cacheSources).toBe(true);
    expect(statements(answer).map((statement) => statement.citations.map((citation) => citation.page))).toEqual([[1], [2]]);
    // The saved text is the one the lawyer sees, not the prompt.
    expect(uow.state.answering.questions).toEqual([expect.objectContaining({ scope: { kind: "peca", pecaId: peca!.id }, text: "Resumo da peça" })]);
  });

  it("throws NotFound for another lawyer's case file", async () => {
    const { ingest, documentMap, events, lawyer } = await setup();
    const caseFileId = await ingest(lawyer, ["digital"]);
    const [peca] = await documentMap(lawyer, caseFileId);

    await expect(events(LawyerId(crypto.randomUUID()), { caseFileId, summarize: peca!.id })).rejects.toThrow(NotFound);
  });
});
