import { describe, expect, it } from "vitest";
import type { Reranker } from "../reranker";

export type RerankerSetup = () => Promise<{ reranker: Reranker }>;

const PASSAGES = [
  "Procuração ad judicia outorgada ao advogado.",
  "A sentença julgou procedente o pedido de indenização por dano moral.",
  "O laudo pericial avaliou o imóvel em duzentos mil reais.",
];

/** The cases every Reranker adapter passes: the fake on every run, Voyage when a key is set. */
export function rerankerContract(setup: RerankerSetup) {
  describe("Reranker contract", () => {
    it("returns at most `top` distinct indexes into the passages", async () => {
      const { reranker } = await setup();

      const { order } = await reranker.rerank("O que a sentença decidiu?", PASSAGES, 2);

      expect(order).toHaveLength(2);
      expect(new Set(order).size).toBe(2);
      for (const index of order) expect(index >= 0 && index < PASSAGES.length).toBe(true);
    });

    it("returns every passage when `top` is more than there are", async () => {
      const { reranker } = await setup();

      const { order } = await reranker.rerank("O que a sentença decidiu?", PASSAGES, 20);

      expect([...order].sort()).toEqual([0, 1, 2]);
    });

    it("reports what it used as rerank usage", async () => {
      const { reranker } = await setup();

      const { usage } = await reranker.rerank("Qual o valor do imóvel?", PASSAGES, 1);

      expect(usage.length).toBeGreaterThan(0);
      for (const event of usage) {
        expect(event).toMatchObject({ kind: "rerank", unit: "token" });
        expect(event.units).toBeGreaterThan(0);
        expect(event.costUsd).toBeGreaterThanOrEqual(0);
      }
    });
  });
}
