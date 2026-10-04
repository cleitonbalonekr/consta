import { readFile } from "node:fs/promises";
import path from "node:path";

/** The seeded case file's PDF, also used as the file journeys upload. */
export function samplePdf() {
  // Playwright loads journeys as CommonJS here, so __dirname rather than import.meta.
  return readFile(path.join(__dirname, "../../public/demo/autos-de-exemplo.pdf"));
}

/** The id of the seeded case file in demo mode. */
export const SAMPLE_CASE_FILE_ID = "autos-de-exemplo";
