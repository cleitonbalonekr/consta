import { getDocument, PDFDataRangeTransport } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { FileStore } from "../ports";

/** pdf.js asks for chunks of this size, so a large PDF is read in parts, not in one piece. */
const CHUNK_BYTES = 1024 * 1024;

/** Counts the pages of a stored PDF. pdf.js reads only the byte ranges it needs. */
export class PdfPageCounter {
  constructor(private readonly files: FileStore) {}

  async count(key: string, bytes: number): Promise<number> {
    // pdf.js waits forever for a range that never arrives, so a failed read rejects here instead.
    let failRead: (error: unknown) => void = () => {};
    const readFailed = new Promise<never>((_, reject) => (failRead = reject));
    const task = getDocument({
      range: new FileStoreRange(this.files, key, bytes, (error) => failRead(error)),
      rangeChunkSize: CHUNK_BYTES,
      disableAutoFetch: true,
      disableStream: true,
      verbosity: 0,
    });
    try {
      return (await Promise.race([task.promise, readFailed])).numPages;
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
