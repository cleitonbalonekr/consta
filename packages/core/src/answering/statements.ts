import type { SourceCitation } from "../ports";
import type { Box } from "../shared";
import type { Citation, Statement } from "./index";

/** A passage that search found, with what a citation of it shows. */
export type FoundPassage = { id: string; page: number; folha: string | null; text: string; boxes: Box[] };

/**
 * What the model reads as one source: a passage that search found, as one block, or a full page
 * of a peça, as one block per line. A citation of some blocks shows their text and boxes.
 */
export type ReadPassage = { id: string; page: number; folha: string | null; blocks: Array<{ text: string; boxes: Box[] }> };

/** A list marker at the start of a line: "- ", "* ", "• ", "1. " or "1) ". */
const LIST_MARKER = /^(?:[-*•]|\d+[.)])\s+/;

/**
 * Turns the model's runs of text into statements, one per line, and keeps a
 * line only when one of its runs cites a passage. This is the rule "no citation,
 * no statement" (ADR-0003); `dropped` counts the lines it removed. The blocks a
 * line cites on one passage make one citation.
 */
export class StatementBuilder {
  private line = "";
  /** The blocks the line cites, by passage id, in the order the passages were first cited. */
  private cited = new Map<string, Set<number>>();
  private droppedLines = 0;

  constructor(private readonly passages: ReadonlyMap<string, ReadPassage>) {}

  get dropped(): number {
    return this.droppedLines;
  }

  /** Adds a run of text and returns the statements whose lines it ends. */
  add(text: string, citations: SourceCitation[]): Statement[] {
    const statements: Statement[] = [];
    text.split("\n").forEach((piece, index) => {
      if (index > 0) statements.push(...this.endLine());
      this.line += piece;
      // A run that only ends a line does not cite the next one.
      if (piece.trim()) for (const citation of citations) this.cite(citation);
    });
    return statements;
  }

  /** Ends the last line. Call it once, after the last run. */
  finish(): Statement[] {
    return this.endLine();
  }

  /** A block the passage does not have, or a passage that was not sent to the model, cites nothing. */
  private cite({ sourceId, firstBlock, lastBlock }: SourceCitation) {
    const passage = this.passages.get(sourceId);
    if (!passage) return;
    const blocks = this.cited.get(sourceId) ?? new Set<number>();
    for (let index = Math.max(firstBlock, 0); index <= Math.min(lastBlock, passage.blocks.length - 1); index++) blocks.add(index);
    if (blocks.size > 0) this.cited.set(sourceId, blocks);
  }

  private endLine(): Statement[] {
    const text = this.line.trim().replace(LIST_MARKER, "");
    const citations = [...this.cited].map(([id, blocks]) => this.citation(id, blocks));
    this.line = "";
    this.cited = new Map();
    if (!text) return [];
    const [first, ...rest] = citations;
    if (!first) {
      this.droppedLines += 1;
      return [];
    }
    return [{ text, citations: [first, ...rest] }];
  }

  /** The cited blocks in page order: their text, one per line, is the quote. */
  private citation(sourceId: string, indexes: Set<number>): Citation {
    // cite() keeps only the ids and block indexes of passages it has.
    const passage = this.passages.get(sourceId)!;
    const blocks = [...indexes].sort((a, b) => a - b).map((index) => passage.blocks[index]!);
    return { page: passage.page, folha: passage.folha, quote: blocks.map((block) => block.text).join("\n"), boxes: blocks.flatMap((block) => block.boxes) };
  }
}
