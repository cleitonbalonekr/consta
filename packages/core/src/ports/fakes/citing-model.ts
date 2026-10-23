import type { CitingModel, CitingModelEvent, Source, SourceCitation } from "../citing-model";

/** A run of answer text. `sourceIds` cites every block of those sources; `citations` cites some blocks. */
type Piece = { text: string; sourceIds?: string[]; citations?: SourceCitation[] };

type Script = (input: { sources: Source[]; question: string }) => Piece[];

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
  readonly calls: Array<{ instructions: string; sources: Source[]; question: string; cacheSources: boolean }> = [];

  constructor(private readonly script: Script = defaultScript) {}

  async *answer(input: { instructions: string; sources: Source[]; question: string; cacheSources: boolean }): AsyncIterable<CitingModelEvent> {
    this.calls.push({ instructions: input.instructions, sources: input.sources, question: input.question, cacheSources: input.cacheSources });
    const pieces = this.script(input);
    for (const { text, sourceIds = [], citations = [] } of pieces) {
      yield { type: "text", text, citations: [...citations, ...sourceIds.map((id) => this.wholeSource(input.sources, id))] };
    }
    const read = [input.question, ...input.sources.flatMap((source) => source.blocks), ...pieces.map((piece) => piece.text)];
    const units = read.reduce((total, text) => total + text.split(/\s+/).filter(Boolean).length, 0);
    yield { type: "usage", usage: { kind: "answer", provider: "fake", model: "fake-citing-model", units, unit: "token", costUsd: 0 } };
  }

  /** A citation of every block of the source. An id it was not given still cites, as a model's mistake would. */
  private wholeSource(sources: Source[], sourceId: string): SourceCitation {
    const blocks = sources.find((source) => source.id === sourceId)?.blocks.length ?? 1;
    return { sourceId, firstBlock: 0, lastBlock: blocks - 1 };
  }
}
