import { describe, expect, it } from "vitest";
import type { CitingModel, CitingModelEvent, Source } from "../ports";
import { FakeCitingModel, FakeReranker, InMemoryUnitOfWork } from "../ports/fakes";
import { LawyerId, NotFound, NotImplemented, PecaId } from "../shared";
import type { CaseFileId } from "../shared";
import { PASSAGES_FOR_MODEL } from "./index";
import type { AnswerEvent, Statement } from "./index";
import { answeringOn, sourceOn } from "./testing";

type Line = { text: string; sourceIds: string[] };

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
    expect(events.at(-1)).toEqual({ type: "done", questionId: expect.any(String), dropped: 0 });
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
        scope: "whole-file",
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
        yield { type: "text", text: "Primeira afirmação.\n", sourceIds: [sources[0]!.id] };
        await finished;
        yield { type: "text", text: "Segunda afirmação.", sourceIds: [sources[0]!.id] };
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
        yield { type: "text", text: "Primeira afirmação.\nSegunda", sourceIds: [sources[0]!.id] };
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

    expect(events).toEqual([{ type: "done", questionId: expect.any(String), dropped: 0 }]);
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

  it("does not answer about one peça or a quick action yet (tickets 10 and 11)", async () => {
    const { ingest, answering, lawyer } = await setup();
    const caseFileId = await ingest(lawyer, ["digital"]);

    const first = (question: Parameters<typeof answering.ask>[1]) => answering.ask(lawyer, question)[Symbol.asyncIterator]().next();

    await expect(first({ caseFileId, scope: { kind: "peca", pecaId: PecaId(crypto.randomUUID()) }, text: "?" })).rejects.toThrow(NotImplemented);
    await expect(first({ caseFileId, quickAction: "timeline" })).rejects.toThrow(NotImplemented);
  });
});
