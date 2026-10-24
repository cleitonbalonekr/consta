import type { PDFDocumentProxy } from "pdfjs-dist";

/** Loads pdf.js in the browser only; it needs a worker and DOM APIs. */
async function loadPdfJs() {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  return pdfjs;
}

/**
 * Where pdf.js fetches its wasm decoders (scripts/copy-pdfjs-wasm.mjs puts them there). Without
 * them a JPEG 2000 or JBIG2 image, as scanned pages often are, is skipped and the page renders white.
 * The worker fetches it, so it must be absolute: relative, it would resolve against the worker's URL.
 */
function wasmUrl() {
  return new URL("/pdfjs/wasm/", window.location.origin).href;
}

/**
 * Opens a PDF from a URL, reading only the byte ranges of the pages it shows when the
 * server allows range requests. Without the two flags pdf.js streams the whole file behind them.
 */
export async function openPdf(url: string): Promise<PDFDocumentProxy> {
  const pdfjs = await loadPdfJs();
  return pdfjs.getDocument({ url, disableAutoFetch: true, disableStream: true, wasmUrl: wasmUrl() }).promise;
}

/** Counts the pages of a PDF the lawyer picked, before any byte is uploaded. */
export async function countPages(file: File): Promise<number> {
  const pdfjs = await loadPdfJs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = pdf.numPages;
  await pdf.loadingTask.destroy();
  return pages;
}
