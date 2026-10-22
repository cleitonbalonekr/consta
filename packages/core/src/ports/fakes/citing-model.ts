import type { CitingModel, CitingModelEvent, Source } from "../citing-model";

type Script = (input: { sources: Source[]; question: string }) => Array<{ text: string; sourceIds: string[] }>;

/** One line per source for the first two sources, then a line that cites nothing, which Answering drops. */
const defaultScript: Script = ({ sources }) => [
  ...sources.slice(0, 2).map((source, index) => ({ text: `Afirmação ${index + 1} de exemplo, de ${source.title}.\n`, sourceIds: [source.id] })),
  { text: "Afirmação de exemplo sem citação.\n", sourceIds: [] },
];

/**
 * Plays back a scripted answer. The default cites the first two sources and adds one
 * uncited line, so fake mode shows the citation rule at work. Usage counts words as tokens.
 */
export class FakeCitingModel implements CitingModel {
  readonly calls: Array<{ sources: Source[]; question: string; cacheSources: boolean }> = [];

  constructor(private readonly script: Script = defaultScript) {}

  async *answer(input: { instructions: string; sources: Source[]; question: string; cacheSources: boolean }): AsyncIterable<CitingModelEvent> {
    this.calls.push({ sources: input.sources, question: input.question, cacheSources: input.cacheSources });
    const pieces = this.script(input);
    for (const piece of pieces) {
      yield { type: "text", ...piece };
    }
    const read = [input.question, ...input.sources.map((source) => source.text), ...pieces.map((piece) => piece.text)];
    const units = read.reduce((total, text) => total + text.split(/\s+/).filter(Boolean).length, 0);
    yield { type: "usage", usage: { kind: "answer", provider: "fake", model: "fake-citing-model", units, unit: "token", costUsd: 0 } };
  }
}
