import type { Ocr, OcrPage } from "../ocr";

/** Returns scripted pages. By default, one page whose text says it came from the fake. */
export class FakeOcr implements Ocr {
  readonly calls: Uint8Array[] = [];

  constructor(
    private readonly respond: (pdf: Uint8Array) => OcrPage[] = () => [
      { index: 1, text: "Texto lido pelo OCR falso.", blocks: [], confidence: 1 },
    ],
  ) {}

  async read(pdf: Uint8Array) {
    this.calls.push(pdf);
    const pages = this.respond(pdf);
    return {
      pages,
      usage: [{ kind: "ocr" as const, provider: "fake", model: "fake-ocr", units: pages.length, unit: "page" as const, costUsd: 0 }],
    };
  }
}
