import type { PDFDocumentProxy } from "pdfjs-dist";

/** Loads pdf.js in the browser only; it needs a worker and DOM APIs. */
async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  return pdfjs;
}

/** Opens a PDF from a URL, reading only the byte ranges it needs when the server allows it. */
export async function openPdf(url: string): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfJs();
  return pdfjs.getDocument({ url }).promise;
}

/** Counts the pages of a PDF the lawyer picked, before any byte is uploaded. */
export async function countPages(file: File): Promise<number> {
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = pdf.numPages;
  await pdf.loadingTask.destroy();
  return pages;
}
