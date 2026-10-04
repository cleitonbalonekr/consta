import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { TextItem } from "pdfjs-dist/types/src/display/api";
import { describe, expect, it } from "vitest";
import { lineBox, SAMPLE_LAYOUT, SAMPLE_PAGES } from "./sample-pages";

const PDF_PATH = new URL("../../../public/demo/autos-de-exemplo.pdf", import.meta.url);

async function readSamplePdf() {
  const data = new Uint8Array(await readFile(PDF_PATH));
  return getDocument({ data, useSystemFonts: false }).promise;
}

describe("the committed sample PDF", () => {
  it("has the pages, lines and folhas of the sample pages, so demo quotes are on their page", async () => {
    const pdf = await readSamplePdf();
    expect(pdf.numPages).toBe(SAMPLE_PAGES.length);

    for (const [index, samplePage] of SAMPLE_PAGES.entries()) {
      const content = await (await pdf.getPage(index + 1)).getTextContent();
      const texts = content.items.map((item) => (item as TextItem).str).filter((text) => text.trim() !== "");
      const expected = samplePage.lines.filter((line) => line !== "");
      expect(texts).toEqual(samplePage.folha ? [`fls. ${samplePage.folha}`, ...expected] : expected);
    }
  });

  it("places every line inside the box the demo citations mark", async () => {
    const pdf = await readSamplePdf();
    const { width, height } = SAMPLE_LAYOUT;

    for (const [index, samplePage] of SAMPLE_PAGES.entries()) {
      const content = await (await pdf.getPage(index + 1)).getTextContent();
      const items = content.items as TextItem[];
      for (const [line, text] of samplePage.lines.entries()) {
        if (text === "") continue;
        const item = items.find((candidate) => candidate.str === text)!;
        const [, , , , x, baseline] = item.transform as number[];
        const box = lineBox(samplePage, line);
        expect(box.x0).toBeLessThanOrEqual(x! / width);
        expect(box.x1).toBeGreaterThanOrEqual((x! + item.width) / width - 0.02);
        expect(box.x1).toBeLessThanOrEqual((x! + item.width) / width + 0.06);
        expect(box.y0).toBeLessThanOrEqual((height - baseline! - SAMPLE_LAYOUT.fontSize * 0.7) / height);
        expect(box.y1).toBeGreaterThanOrEqual((height - baseline!) / height);
      }
    }
  });
});
