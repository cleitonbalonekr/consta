import type { Box } from "../shared";
import type { Metered } from "./usage";

export type OcrBlock = { text: string; box: Box };

export type OcrPage = {
  /** Position in the PDF that was sent, starting at 1. */
  index: number;
  text: string;
  blocks: OcrBlock[];
  /** 0 to 1. */
  confidence: number;
};

/** Reads scanned pages. The caller sends a PDF that holds only the pages to read. */
export interface Ocr {
  read(pdf: Uint8Array): Promise<Metered<{ pages: OcrPage[] }>>;
}
