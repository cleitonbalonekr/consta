import { getDocument, PDFDataRangeTransport } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { FileStore } from "../ports";

/** pdf.js asks for chunks of this size, so a large PDF is read in parts, not in one piece. */
const CHUNK_BYTES = 1024 * 1024;

/**
 * Opens a stored PDF with pdf.js, which reads only the byte ranges it needs through
 * `FileStore.read`. Case files counts pages with it; Ingestion reads page text.
 * Not exported from `shared/index.ts`: modules import it by path.
 */
export class StoredPdf {
  /** Calls `work` with the open document and closes the document after it. */
  static async use<T>(files: FileStore, key: string, bytes: number, work: (pdf: PDFDocumentProxy) => Promise<T>): Promise<T> {
    // pdf.js waits forever for a range that never arrives, so a failed read rejects here instead.
    let failRead: (error: unknown) => void = () => {};
    const readFailed = new Promise<never>((_, reject) => (failRead = reject));
    const task = getDocument({
      range: new FileStoreRange(files, key, bytes, (error) => failRead(error)),
      rangeChunkSize: CHUNK_BYTES,
      disableAutoFetch: true,
      disableStream: true,
      verbosity: 0,
    });
    try {
      const pdf = await Promise.race([task.promise, readFailed]);
      return await Promise.race([work(pdf), readFailed]);
    } finally {
      await task.destroy();
    }
  }
}

/** Gives pdf.js the byte ranges it asks for from the file store. */
class FileStoreRange extends PDFDataRangeTransport {
  constructor(
    private readonly files: FileStore,
    private readonly key: string,
    bytes: number,
    private readonly onReadError: (error: unknown) => void,
  ) {
    super(bytes, null);
  }

  override requestDataRange(begin: number, end: number) {
    this.files.read(this.key, { start: begin, end }).then((chunk) => this.onDataRange(begin, chunk), this.onReadError);
  }
}
