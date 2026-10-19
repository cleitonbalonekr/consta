import type { Box, PageSource } from "../shared";
import { Folha } from "./folha";
import { PageClassifier } from "./page-classifier";

/** One line of text on a page and where it is. The viewer marks a citation with these boxes. */
export type Block = { text: string; box: Box };

/** What the Ingestion repository stores for one page. */
export type PageRecord = { number: number; folha: string | null; source: PageSource; text: string; blocks: Block[] };

/** A passage before it is embedded. `blockIndexes` point into its page's blocks. */
export type PassageDraft = { page: number; text: string; blockIndexes: number[] };

/** About 300 tokens of Portuguese: small enough to cite one point, large enough to hold it. */
export const MAX_PASSAGE_CHARS = 1_200;

/** One page as ingestion read it: classified, with its folha, and split into passages. */
export class Page {
  private constructor(
    readonly number: number,
    readonly source: PageSource,
    readonly folha: string | null,
    /** Empty for a scanned page: the MVP does not read it (ADR-0010). */
    readonly blocks: readonly Block[],
  ) {}

  /** A page from the blocks of its text layer, in reading order. */
  static read(number: number, blocks: Block[]): Page {
    const source = PageClassifier.classify(blocks);
    return new Page(number, source, Folha.read(blocks), source === "digital" ? blocks : []);
  }

  record(): PageRecord {
    const { number, folha, source } = this;
    return { number, folha, source, text: this.blocks.map((block) => block.text).join("\n"), blocks: [...this.blocks] };
  }

  /**
   * Consecutive blocks joined up to MAX_PASSAGE_CHARS. A passage never crosses a page
   * break, because it is cut from one page; a block longer than the limit is a passage alone.
   */
  passages(): PassageDraft[] {
    const passages: PassageDraft[] = [];
    let current: PassageDraft | null = null;
    this.blocks.forEach((block, index) => {
      if (current && current.text.length + 1 + block.text.length <= MAX_PASSAGE_CHARS) {
        current.text += `\n${block.text}`;
        current.blockIndexes.push(index);
        return;
      }
      current = { page: this.number, text: block.text, blockIndexes: [index] };
      passages.push(current);
    });
    return passages;
  }
}
