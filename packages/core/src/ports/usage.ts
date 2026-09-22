/** What one call to a paid provider cost. Every AI port returns it; Metering stores it. */
export type Usage = {
  kind: "ocr" | "embed" | "rerank" | "extract" | "answer";
  provider: string;
  model: string;
  units: number;
  unit: "page" | "token";
  costUsd: number;
};

export type Metered<T> = T & { usage: Usage[] };
