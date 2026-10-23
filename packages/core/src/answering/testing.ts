// Test helpers for the Answering tests, unit and integration. Not part of the module's interface.
// Answering needs ingested case files, and the fixture PDFs and their upload live with Ingestion's helpers.
// eslint-disable-next-line no-restricted-imports
import { fixturePdf, ingestionOn } from "../ingestion/testing";
// eslint-disable-next-line no-restricted-imports
import type { FixturePage } from "../ingestion/testing";
import { FakeCitingModel, FakeEmbedder, FakeReranker } from "../ports/fakes";
import type { CitingModel, Reranker, Source, UnitOfWork } from "../ports";
import type { PecaView } from "../case-files";
import type { CaseFileId, LawyerId } from "../shared";
import { Answering } from "./index";
import type { AnswerEvent, QuestionInput } from "./index";

/** The source the model reads for a page: its title starts with "Página N". */
export function sourceOn(sources: Source[], page: number): Source {
  const source = sources.find((candidate) => candidate.title === `Página ${page}` || candidate.title.startsWith(`Página ${page} `));
  if (!source) throw new Error(`No source on page ${page}.`);
  return source;
}

/**
 * Answering on the given unit of work, beside the modules that ingest its case files.
 * The default model is the FakeCitingModel's default script.
 */
export function answeringOn(uow: UnitOfWork, options: { model?: CitingModel; reranker?: Reranker } = {}) {
  const { model = new FakeCitingModel(), reranker = new FakeReranker() } = options;
  const embedder = new FakeEmbedder();
  const built = ingestionOn(uow, { embedder });
  const answering = new Answering({ uow, embedder, reranker, model, metering: built.metering });

  /** Uploads a fixture PDF and waits until ingestion ends, so the case file is ready. */
  async function ingest(lawyer: LawyerId, pages: FixturePage[]): Promise<CaseFileId> {
    const caseFileId = await built.upload(lawyer, await fixturePdf(pages), pages.length);
    await built.jobs.idle();
    return caseFileId;
  }

  /** Every event of a whole-file question, in order. */
  async function ask(lawyer: LawyerId, caseFileId: CaseFileId, text = "Do que trata esta ação?"): Promise<AnswerEvent[]> {
    return events(lawyer, { caseFileId, scope: { kind: "whole-file" }, text });
  }

  /** Every event of any question, in order. */
  async function events(lawyer: LawyerId, question: QuestionInput): Promise<AnswerEvent[]> {
    const all: AnswerEvent[] = [];
    for await (const event of answering.ask(lawyer, question)) all.push(event);
    return all;
  }

  /** The case file's peças, in page order. */
  async function documentMap(lawyer: LawyerId, caseFileId: CaseFileId): Promise<PecaView[]> {
    return (await built.caseFiles.view(lawyer, caseFileId)).documentMap;
  }

  return { ...built, answering, ingest, ask, events, documentMap };
}
