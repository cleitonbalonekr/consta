import type { CitingModel, CitingModelEvent, Source } from "../citing-model";

type Script = (input: { sources: Source[]; question: string }) => Array<{ text: string; sourceIds: string[] }>;

/**
 * Plays back a scripted answer. The default cites the first source, so tests that
 * need an uncited statement script one explicitly.
 */
export class FakeCitingModel implements CitingModel {
  readonly calls: Array<{ sources: Source[]; question: string; cacheSources: boolean }> = [];

  constructor(
    private readonly script: Script = ({ sources }) =>
      sources[0] ? [{ text: "Resposta falsa.", sourceIds: [sources[0].id] }] : [],
  ) {}

  async *answer(input: { instructions: string; sources: Source[]; question: string; cacheSources: boolean }): AsyncIterable<CitingModelEvent> {
    this.calls.push({ sources: input.sources, question: input.question, cacheSources: input.cacheSources });
    for (const piece of this.script(input)) {
      yield { type: "text", ...piece };
    }
    yield {
      type: "usage",
      usage: { kind: "answer", provider: "fake", model: "fake-citing-model", units: 0, unit: "token", costUsd: 0 },
    };
  }
}
