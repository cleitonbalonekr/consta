import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

/** The upload's part size in src/components/upload-case-file.tsx. */
const PART_BYTES = 10 * 1024 * 1024;

/** A 10-page case file that journeys upload. */
export function samplePdf() {
  // Playwright loads journeys as CommonJS here, so __dirname rather than import.meta.
  return readFile(path.join(__dirname, "../fixtures/autos-de-exemplo.pdf"));
}

/** A real PDF with this many blank pages. */
export async function pdfWithPages(pages: number) {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < pages; i++) pdf.addPage([200, 200]);
  return Buffer.from(await pdf.save());
}

/** A one-page PDF larger than one upload part, so the browser sends it in two parts. */
export async function twoPartPdf() {
  const pdf = await PDFDocument.create();
  pdf.addPage([200, 200]);
  // Random bytes don't compress, so the PDF stays larger than one part.
  await pdf.attach(randomBytes(PART_BYTES + 1024 * 1024), "anexo.bin", { mimeType: "application/octet-stream" });
  return Buffer.from(await pdf.save());
}
