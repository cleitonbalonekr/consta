import type { FileStore } from "../ports";
import { StoredPdf } from "../shared/stored-pdf";

/** Counts the pages of a stored PDF. pdf.js reads only the byte ranges it needs. */
export class PdfPageCounter {
  constructor(private readonly files: FileStore) {}

  count(key: string, bytes: number): Promise<number> {
    return StoredPdf.use(this.files, key, bytes, async (pdf) => pdf.numPages);
  }
}
