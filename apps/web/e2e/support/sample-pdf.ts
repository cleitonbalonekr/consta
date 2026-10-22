import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";

/** The upload's part size in src/components/upload-case-file.tsx. */
const PART_BYTES = 10 * 1024 * 1024;

/** A 1×1 grey PNG, stretched over a scanned page. */
const SCAN = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNoAAAAggCBd81ytgAAAABJRU5ErkJggg==", "base64");

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

/**
 * A case file of digital pages, each with a "fls." stamp and a few lines of text, and
 * scanned pages (an image with no text) at the given page numbers.
 */
export async function pdfWithText(pages: number, scanned: number[] = []) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const scan = await pdf.embedPng(SCAN);
  for (let number = 1; number <= pages; number++) {
    const page = pdf.addPage([595, 842]);
    page.drawText(`fls. ${number}`, { x: 480, y: 800, size: 10, font });
    if (scanned.includes(number)) {
      page.drawImage(scan, { x: 0, y: 0, width: 595, height: 842 });
      continue;
    }
    for (let line = 0; line < 30; line++) {
      page.drawText(`Página ${number}, linha ${line + 1}: a autora requer a indenização por danos morais.`, { x: 72, y: 740 - line * 20, size: 11, font });
    }
  }
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
