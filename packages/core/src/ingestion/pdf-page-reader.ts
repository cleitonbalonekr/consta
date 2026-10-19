import { Util } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import type { FileStore } from "../ports";
import type { PageRange } from "../shared";
import { StoredPdf } from "../shared/stored-pdf";
import { Page } from "./page";
import type { Block } from "./page";

/** Pages handed over at once: one embedding call and one commit, so progress moves every few pages. */
export const PAGES_PER_BATCH = 10;

/** A gap wider than this many font heights starts a new block, such as the next column. */
const COLUMN_GAP = 1.5;

/**
 * One block as it grows from pdf.js text items, in viewport units (origin top-left):
 * its bounding rectangle, and the baseline and font height that decide what joins it.
 */
type Line = { text: string; x0: number; x1: number; top: number; bottom: number; baseline: number; height: number };

/** Room under the baseline for descenders, in font heights. */
const DESCENT = 0.25;

/** Reads the text and block positions of a stored PDF's pages with pdf.js (ADR-0004). */
export class PdfPageReader {
  constructor(private readonly files: FileStore) {}

  /** Reads the range's pages in order and hands them to `onBatch`, PAGES_PER_BATCH at a time. */
  async read(key: string, bytes: number, range: PageRange, onBatch: (pages: Page[]) => Promise<void>): Promise<void> {
    await StoredPdf.use(this.files, key, bytes, async (pdf) => {
      if (range.last > pdf.numPages) throw new RangeError(`Page ${range.last} is past the last page, ${pdf.numPages}.`);
      let batch: Page[] = [];
      for (let number = range.first; number <= range.last; number++) {
        batch.push(Page.read(number, await blocksOf(pdf, number)));
        if (batch.length < PAGES_PER_BATCH && number < range.last) continue;
        await onBatch(batch);
        batch = [];
      }
    });
  }
}

async function blocksOf(pdf: PDFDocumentProxy, number: number): Promise<Block[]> {
  const page = await pdf.getPage(number);
  try {
    const viewport = page.getViewport({ scale: 1 });
    const { items } = await page.getTextContent();
    const lines = joinIntoLines(items.filter((item): item is TextItem => "str" in item), viewport.transform);
    return lines.map((line) => ({ text: line.text, box: boxOf(line, viewport.width, viewport.height) }));
  } finally {
    page.cleanup();
  }
}

/**
 * Joins pdf.js text items, which are runs of text in content order, into lines. An item
 * starts a new line after an end of line, on another baseline, or after a wide gap.
 */
function joinIntoLines(items: TextItem[], viewportTransform: number[]): Line[] {
  const lines: Line[] = [];
  let current: Line | null = null;
  let endOfLine = false;
  for (const item of items) {
    const next = lineOf(item, viewportTransform);
    if (next.text.trim()) {
      if (current && !endOfLine && continues(current, next)) append(current, next);
      else lines.push((current = next));
    }
    endOfLine = item.hasEOL || (endOfLine && !next.text.trim());
  }
  return lines
    .map((line) => ({ ...line, text: line.text.replace(/\s+/g, " ").trim() }))
    .filter((line) => line.text);
}

/** The rectangle around an item, also when its text runs up or down the page, as margin stamps do. */
function lineOf(item: TextItem, viewportTransform: number[]): Line {
  // [a, b, c, d, e, f]: (a, b) points along the text, (c, d) up the glyphs, (e, f) is where the baseline starts.
  const [a, b, c, d, e, f] = Util.transform(viewportTransform, item.transform) as [number, number, number, number, number, number];
  const height = Math.hypot(c, d) || item.height;
  const [alongX, alongY] = unit(a, b);
  const [upX, upY] = unit(c, d);
  const corners = [-DESCENT, 1].flatMap((up) =>
    [0, item.width].map((along) => [e + alongX * along + upX * up * height, f + alongY * along + upY * up * height] as const),
  );
  const xs = corners.map(([x]) => x);
  const ys = corners.map(([, y]) => y);
  return { text: item.str, x0: Math.min(...xs), x1: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys), baseline: f, height };
}

function unit(x: number, y: number): [number, number] {
  const length = Math.hypot(x, y) || 1;
  return [x / length, y / length];
}

function continues(line: Line, next: Line) {
  const sameBaseline = Math.abs(line.baseline - next.baseline) < line.height / 2;
  const gap = next.x0 - line.x1;
  return sameBaseline && gap > -line.height && gap < COLUMN_GAP * line.height;
}

function append(line: Line, next: Line) {
  const spaced = next.x0 - line.x1 > line.height * 0.1 && !/\s$/.test(line.text) && !/^\s/.test(next.text);
  line.text += (spaced ? " " : "") + next.text;
  line.x1 = Math.max(line.x1, next.x1);
  line.top = Math.min(line.top, next.top);
  line.bottom = Math.max(line.bottom, next.bottom);
  line.height = Math.max(line.height, next.height);
}

/** In fractions of the page. */
function boxOf(line: Line, width: number, height: number) {
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return { x0: clamp(line.x0 / width), y0: clamp(line.top / height), x1: clamp(line.x1 / width), y1: clamp(line.bottom / height) };
}
