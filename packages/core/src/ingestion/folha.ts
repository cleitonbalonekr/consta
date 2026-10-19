import type { Block } from "./page";

/**
 * A court stamp alone in its block: "fls. 123", "Fls.: 1.234", "fl. 7", "fls. 45v".
 * The text must be the whole block, so a mention in a sentence ("conforme fls. 45") is not a stamp.
 */
const STAMP = /^(?:fls?|folhas?)\s*\.?\s*:?\s*(\d{1,3}(?:\.\d{3})+|\d+)\s*(-?\s*v(?:erso)?)?\.?$/i;

/** The sheet number a court stamped on a page, which can differ from the page number. */
export class Folha {
  /** Whether the block's text is a folha stamp and nothing else. */
  static isStamp(text: string): boolean {
    return STAMP.test(text.trim());
  }

  /**
   * The folha of a page, as digits with no thousands dots and a "v" for a verso
   * ("1234", "45v"), or null when the page has no stamp. With two stamps, the top one wins:
   * courts stamp the top corner.
   */
  static read(blocks: readonly Block[]): string | null {
    let found: { value: string; top: number } | null = null;
    for (const block of blocks) {
      const match = STAMP.exec(block.text.trim());
      if (!match || (found && found.top <= block.box.y0)) continue;
      found = { value: match[1]!.replaceAll(".", "") + (match[2] ? "v" : ""), top: block.box.y0 };
    }
    return found?.value ?? null;
  }
}
