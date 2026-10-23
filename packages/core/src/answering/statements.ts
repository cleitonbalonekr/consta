import type { Box } from "../shared";
import type { Citation, Statement } from "./index";

/** A passage the model reads, with what a citation of it shows: one that search found, or one full page of a peça. */
export type FoundPassage = { id: string; page: number; folha: string | null; text: string; boxes: Box[] };

/** A list marker at the start of a line: "- ", "* ", "• ", "1. " or "1) ". */
const LIST_MARKER = /^(?:[-*•]|\d+[.)])\s+/;

/**
 * Turns the model's runs of text into statements, one per line, and keeps a
 * line only when one of its runs cites a passage. This is the rule "no citation,
 * no statement" (ADR-0003); `dropped` counts the lines it removed.
 */
export class StatementBuilder {
  private line = "";
  private sourceIds = new Set<string>();
  private droppedLines = 0;

  constructor(private readonly passages: ReadonlyMap<string, FoundPassage>) {}

  get dropped(): number {
    return this.droppedLines;
  }

  /** Adds a run of text and returns the statements whose lines it ends. */
  add(text: string, sourceIds: string[]): Statement[] {
    const statements: Statement[] = [];
    text.split("\n").forEach((piece, index) => {
      if (index > 0) statements.push(...this.endLine());
      this.line += piece;
      // A run that only ends a line does not cite the next one.
      if (piece.trim()) for (const id of sourceIds) this.sourceIds.add(id);
    });
    return statements;
  }

  /** Ends the last line. Call it once, after the last run. */
  finish(): Statement[] {
    return this.endLine();
  }

  private endLine(): Statement[] {
    const text = this.line.trim().replace(LIST_MARKER, "");
    const citations = [...this.sourceIds].flatMap((id) => this.citation(id));
    this.line = "";
    this.sourceIds = new Set();
    if (!text) return [];
    const [first, ...rest] = citations;
    if (!first) {
      this.droppedLines += 1;
      return [];
    }
    return [{ text, citations: [first, ...rest] }];
  }

  /** An id that names no passage sent to the model cites nothing. */
  private citation(sourceId: string): Citation[] {
    const passage = this.passages.get(sourceId);
    if (!passage) return [];
    return [{ page: passage.page, folha: passage.folha, quote: passage.text, boxes: passage.boxes }];
  }
}
