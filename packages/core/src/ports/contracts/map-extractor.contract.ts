import { describe, expect, it } from "vitest";
import { factKinds, pecaTypes } from "../../shared/values";
import type { MapExtractor, PageText, PecaDraft } from "../map-extractor";

export type MapExtractorSetup = () => Promise<{ extractor: MapExtractor }>;

/** Three pages of a small lawsuit: the petição inicial on pages 1 and 2, the sentença on page 3. */
const PAGES: PageText[] = [
  {
    page: 1,
    text: [
      "EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA 1ª VARA CÍVEL DA COMARCA DE SÃO PAULO",
      "MARIA APARECIDA SOUZA, brasileira, professora, vem propor AÇÃO DE INDENIZAÇÃO POR DANOS MORAIS",
      "em face de BANCO EXEMPLO S.A., pelos fatos a seguir expostos. Em 10 de janeiro de 2026 o réu",
      "inscreveu o nome da autora no cadastro de inadimplentes por uma dívida que ela já havia pago.",
    ].join("\n"),
    source: "digital",
  },
  {
    page: 2,
    text: [
      "DOS PEDIDOS. Diante do exposto, requer a condenação do réu ao pagamento de R$ 20.000,00",
      "a título de danos morais. Dá-se à causa o valor de R$ 20.000,00. São Paulo, 10 de março de 2026.",
      "JOSÉ DA SILVA, advogado, OAB/SP 123.456.",
    ].join("\n"),
    source: "digital",
  },
  {
    page: 3,
    text: [
      "SENTENÇA. Vistos. MARIA APARECIDA SOUZA move ação de indenização contra BANCO EXEMPLO S.A.",
      "Ante o exposto, JULGO PROCEDENTE o pedido e condeno o réu a pagar R$ 10.000,00 a título de danos",
      "morais. São Paulo, 4 de maio de 2026. Juíza de Direito ANA PEREIRA.",
    ].join("\n"),
    source: "digital",
  },
];

/** The cases every MapExtractor adapter passes: the fake on every run, Claude when a key is set. */
export function mapExtractorContract(setup: MapExtractorSetup) {
  describe("MapExtractor contract", () => {
    it("returns peças of a known type, each inside the pages it read", async () => {
      const { extractor } = await setup();

      const { pecas } = await extractor.extract({ pages: PAGES, openPeca: null });

      expect(pecas.length).toBeGreaterThan(0);
      for (const peca of pecas) {
        expect(pecaTypes).toContain(peca.type);
        expect(peca.firstPage).toBeGreaterThanOrEqual(1);
        expect(peca.firstPage).toBeLessThanOrEqual(peca.lastPage);
        expect(peca.lastPage).toBeLessThanOrEqual(3);
        expect(peca.date === null || /^\d{4}-\d{2}-\d{2}$/.test(peca.date)).toBe(true);
        expect(peca.title.length).toBeGreaterThan(0);
        expect(peca.summary.length).toBeGreaterThan(0);
      }
    });

    it("returns facts of a known kind, each on a page it read", async () => {
      const { extractor } = await setup();

      const { facts } = await extractor.extract({ pages: PAGES, openPeca: null });

      for (const fact of facts) {
        expect(factKinds).toContain(fact.kind);
        expect([1, 2, 3]).toContain(fact.page);
        expect(fact.value.length).toBeGreaterThan(0);
      }
    });

    it("continues an open peça from its first page, or starts the window with a new one", async () => {
      const { extractor } = await setup();
      const openPeca: PecaDraft = {
        type: "peticao-inicial",
        title: "Petição inicial",
        date: "2026-03-10",
        firstPage: 1,
        lastPage: 1,
        summary: "A autora pede indenização por danos morais.",
      };

      const { pecas } = await extractor.extract({ pages: PAGES.slice(1), openPeca });

      expect(pecas.length).toBeGreaterThan(0);
      expect([1, 2]).toContain(pecas[0]!.firstPage);
    });

    it("reports what it read as extract usage", async () => {
      const { extractor } = await setup();

      const { usage } = await extractor.extract({ pages: PAGES, openPeca: null });

      expect(usage).toHaveLength(1);
      expect(usage[0]).toMatchObject({ kind: "extract", unit: "token" });
      expect(usage[0]!.units).toBeGreaterThan(0);
      expect(usage[0]!.costUsd).toBeGreaterThanOrEqual(0);
    });
  });
}
