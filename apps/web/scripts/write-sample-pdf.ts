// Writes the seeded demo case file from src/server/demo/sample-pages.ts.
// Run with `pnpm demo:pdf` after editing the sample pages.
import { writeFile } from "node:fs/promises";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { lineBaseline, SAMPLE_LAYOUT, SAMPLE_PAGES } from "../src/server/demo/sample-pages";

const OUTPUT = new URL("../public/demo/autos-de-exemplo.pdf", import.meta.url);
// A fixed date keeps the file byte-for-byte stable between runs.
const FIXED_DATE = new Date("2026-02-10T12:00:00Z");

async function main() {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Autos de exemplo");
  pdf.setProducer("Consta");
  pdf.setCreator("Consta");
  pdf.setCreationDate(FIXED_DATE);
  pdf.setModificationDate(FIXED_DATE);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const { width, height, marginX, fontSize, folha } = SAMPLE_LAYOUT;

  for (const samplePage of SAMPLE_PAGES) {
    const page = pdf.addPage([width, height]);
    if (samplePage.folha) {
      page.drawText(`fls. ${samplePage.folha}`, { x: folha.x, y: folha.y, size: folha.fontSize, font });
    }
    samplePage.lines.forEach((line, index) => {
      page.drawText(line, { x: marginX, y: lineBaseline(index), size: fontSize, font });
    });
  }

  await writeFile(OUTPUT, await pdf.save({ useObjectStreams: false }));
  console.log(`Wrote ${SAMPLE_PAGES.length} pages to ${OUTPUT.pathname}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
