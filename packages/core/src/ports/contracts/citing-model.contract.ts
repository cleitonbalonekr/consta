import { describe, expect, it } from "vitest";
import type { CitingModel, CitingModelEvent, Source } from "../citing-model";

export type CitingModelSetup = () => Promise<{ model: CitingModel }>;

const SOURCES: Source[] = [
  { id: "passage-12", title: "Página 12 (fls. 13)", text: "Ante o exposto, JULGO PROCEDENTE o pedido e condeno o réu a pagar R$ 10.000,00 a título de danos morais." },
  { id: "passage-40", title: "Página 40", text: "O laudo pericial avaliou o imóvel em R$ 200.000,00." },
];

const INSTRUCTIONS = "Answer in Brazilian Portuguese, one statement per line, using only the sources.";

async function events(model: CitingModel, question: string) {
  const all: CitingModelEvent[] = [];
  for await (const event of model.answer({ instructions: INSTRUCTIONS, sources: SOURCES, question, cacheSources: false })) all.push(event);
  return all;
}

/** The cases every CitingModel adapter passes: the fake on every run, Claude when a key is set. */
export function citingModelContract(setup: CitingModelSetup) {
  describe("CitingModel contract", () => {
    it("answers with text that cites only the ids of the sources it was given", async () => {
      const { model } = await setup();

      const texts = (await events(model, "Qual foi a condenação na sentença?")).flatMap((event) => (event.type === "text" ? [event] : []));

      const cited = texts.flatMap((event) => event.sourceIds);
      expect(cited.length).toBeGreaterThan(0);
      for (const id of cited) expect(SOURCES.map((source) => source.id)).toContain(id);
    });

    it("reports what the answer used as answer usage, after the text", async () => {
      const { model } = await setup();

      const all = await events(model, "Qual o valor do imóvel?");

      const usage = all.flatMap((event) => (event.type === "usage" ? [event.usage] : []));
      expect(usage).toHaveLength(1);
      expect(usage[0]).toMatchObject({ kind: "answer", unit: "token" });
      expect(usage[0]!.units).toBeGreaterThan(0);
      expect(usage[0]!.costUsd).toBeGreaterThanOrEqual(0);
      expect(all.at(-1)?.type).toBe("usage");
    });
  });
}
