import { describe, expect, it } from "vitest";
import { MAX_PASSAGE_CHARS, Page } from "./page";
import type { Block } from "./page";

const line = (text: string, i: number): Block => ({ text, box: { x0: 0.1, y0: 0.1 + i * 0.02, x1: 0.9, y1: 0.12 + i * 0.02 } });

describe("Page", () => {
  it("keeps the text, blocks and folha of a digital page", () => {
    const blocks = ["fls. 8", "SENTENÇA", "Vistos. Julgo procedente o pedido de indenização."].map(line);

    const page = Page.read(7, blocks);

    expect(page.record()).toEqual({
      number: 7,
      folha: "8",
      source: "digital",
      text: "fls. 8\nSENTENÇA\nVistos. Julgo procedente o pedido de indenização.",
      blocks,
    });
  });

  it("stores a scanned page with its folha but no text and no passages (ADR-0010)", () => {
    const page = Page.read(3, ["fls. 4", "assinado digitalmente por JOSE DA SILVA"].map(line));

    expect(page.record()).toEqual({ number: 3, folha: "4", source: "scanned", text: "", blocks: [] });
    expect(page.passages()).toEqual([]);
  });

  it("splits a page into passages of whole blocks up to the size limit, keeping their block indexes", () => {
    const sentence = "O réu foi citado e apresentou contestação no prazo legal. ".repeat(5).trim();
    const blocks = Array.from({ length: 10 }, (_, i) => line(`${i}: ${sentence}`, i));

    const passages = Page.read(2, blocks).passages();

    expect(passages.length).toBeGreaterThan(1);
    expect(passages.flatMap((passage) => passage.blockIndexes)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const passage of passages) {
      expect(passage.page).toBe(2);
      expect(passage.text.length).toBeLessThanOrEqual(MAX_PASSAGE_CHARS);
      expect(passage.text).toBe(passage.blockIndexes.map((i) => blocks[i]!.text).join("\n"));
    }
  });

  it("keeps a block longer than the limit as one passage", () => {
    const long = "a".repeat(MAX_PASSAGE_CHARS + 10);

    const passages = Page.read(1, [line("SENTENÇA", 0), line(long, 1)]).passages();

    expect(passages.map((passage) => passage.blockIndexes)).toEqual([[0], [1]]);
  });
});
