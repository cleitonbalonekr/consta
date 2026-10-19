import { describe, expect, it } from "vitest";
import type { Embedder } from "../embedder";

export type EmbedderSetup = () => Promise<{ embedder: Embedder }>;

const dot = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + value * b[i]!, 0);
const length = (a: number[]) => Math.sqrt(dot(a, a));
const cosine = (a: number[], b: number[]) => dot(a, b) / (length(a) * length(b));

/** The cases every Embedder adapter passes: the fake on every run, Voyage when a key is set. */
export function embedderContract(setup: EmbedderSetup) {
  describe("Embedder contract", () => {
    it("returns one vector of the stated dimensions per text, in the order of the texts", async () => {
      const { embedder } = await setup();
      const texts = ["A sentença julgou procedente o pedido de indenização.", "O laudo pericial avaliou o imóvel.", "Procuração ad judicia."];

      const { vectors } = await embedder.embed(texts, "passage");

      expect(vectors).toHaveLength(3);
      for (const vector of vectors) expect(vector).toHaveLength(embedder.dimensions);
      const [again] = (await embedder.embed([texts[1]!], "passage")).vectors;
      expect(cosine(again!, vectors[1]!)).toBeGreaterThan(0.99);
    });

    it("places a question nearer the passage that answers it", async () => {
      const { embedder } = await setup();
      const { vectors: passages } = await embedder.embed(
        ["A sentença julgou procedente o pedido de indenização por dano moral.", "O laudo pericial avaliou o imóvel em duzentos mil reais."],
        "passage",
      );

      const [question] = (await embedder.embed(["O que a sentença julgou sobre o pedido de indenização?"], "question")).vectors;

      expect(cosine(question!, passages[0]!)).toBeGreaterThan(cosine(question!, passages[1]!));
    });

    it("reports the tokens it used as embed usage", async () => {
      const { embedder } = await setup();

      const { usage } = await embedder.embed(["Despacho: cite-se o réu."], "passage");

      expect(usage.length).toBeGreaterThan(0);
      for (const event of usage) {
        expect(event).toMatchObject({ kind: "embed", unit: "token", model: embedder.model });
        expect(event.units).toBeGreaterThan(0);
        expect(event.costUsd).toBeGreaterThanOrEqual(0);
      }
    });
  });
}
