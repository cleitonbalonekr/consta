import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { concatTransformationMatrix, drawObject, PDFDocument, popGraphicsState, pushGraphicsState, StandardFonts } from "pdf-lib";

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
 * scanned pages (an image with no text) at the given page numbers. `attachmentBytes` of
 * random bytes make the file larger without adding pages. `ocrScans` are pages whose text
 * lies over a JPEG 2000 scan, as on a scanned page with a text layer; pdf.js decodes it with wasm.
 */
export async function pdfWithText(pages: number, scanned: number[] = [], { attachmentBytes = 0, ocrScans = [] as number[] } = {}) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const scan = await pdf.embedPng(SCAN);
  const jpx = await jpxScan(pdf);
  for (let number = 1; number <= pages; number++) {
    const page = pdf.addPage([595, 842]);
    if (ocrScans.includes(number)) {
      const name = page.node.newXObject("Scan", jpx);
      page.pushOperators(pushGraphicsState(), concatTransformationMatrix(595, 0, 0, 842, 0, 0), drawObject(name), popGraphicsState());
    }
    page.drawText(`fls. ${number}`, { x: 480, y: 800, size: 10, font });
    if (scanned.includes(number)) {
      page.drawImage(scan, { x: 0, y: 0, width: 595, height: 842 });
      continue;
    }
    for (let line = 0; line < 30; line++) {
      page.drawText(`Página ${number}, linha ${line + 1}: a autora requer a indenização por danos morais.`, { x: 72, y: 740 - line * 20, size: 11, font });
    }
  }
  if (attachmentBytes > 0) await pdf.attach(randomBytes(attachmentBytes), "anexo.bin", { mimeType: "application/octet-stream" });
  return Buffer.from(await pdf.save());
}

/** A 64×64 JPEG 2000 image, stored as is: pdf-lib embeds only PNG and JPEG. */
async function jpxScan(pdf: PDFDocument) {
  const bytes = await readFile(path.join(__dirname, "../fixtures/scan.jp2"));
  return pdf.context.register(pdf.context.stream(bytes, { Type: "XObject", Subtype: "Image", Width: 64, Height: 64, Filter: "JPXDecode" }));
}

/** A one-page PDF larger than one upload part, so the browser sends it in two parts. */
export async function twoPartPdf() {
  const pdf = await PDFDocument.create();
  pdf.addPage([200, 200]);
  // Random bytes don't compress, so the PDF stays larger than one part.
  await pdf.attach(randomBytes(PART_BYTES + 1024 * 1024), "anexo.bin", { mimeType: "application/octet-stream" });
  return Buffer.from(await pdf.save());
}
