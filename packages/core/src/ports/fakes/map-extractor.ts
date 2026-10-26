import type { PecaType } from "../../shared";
import type { FactDraft, MapExtractor, PageText, PecaDraft } from "../map-extractor";

type Script = (input: { pages: PageText[]; openPeca: PecaDraft | null }) => {
  pecas: PecaDraft[];
  facts: FactDraft[];
};

/** The peças of a lawsuit in the order they usually come, for the default map. */
const LAWSUIT: Array<{ type: PecaType; title: string }> = [
  { type: "peticao-inicial", title: "Petição inicial" },
  { type: "contestacao", title: "Contestação" },
  { type: "sentenca", title: "Sentença" },
  { type: "recurso", title: "Apelação" },
  { type: "acordao", title: "Acórdão" },
];

/** Returns scripted peças and facts; by default, peças of two pages and a fact of every kind on each page with text. */
export class FakeMapExtractor implements MapExtractor {
  constructor(private readonly script: Script = FakeMapExtractor.lawsuit) {}

  /** The default: the peças of twoPagePecas and the facts of factsOnEachPage. */
  static lawsuit(input: { pages: PageText[] }): { pecas: PecaDraft[]; facts: FactDraft[] } {
    return { pecas: FakeMapExtractor.twoPagePecas(input).pecas, facts: FakeMapExtractor.factsOnEachPage(input) };
  }

  /** One fact of every kind on each page with text, named after its page, so fake mode answers quick actions. */
  static factsOnEachPage({ pages }: { pages: PageText[] }): FactDraft[] {
    return pages
      .filter((page) => page.text.trim())
      .flatMap(({ page }) => {
        const day = String(((page - 1) % 28) + 1).padStart(2, "0");
        const facts: Array<Omit<FactDraft, "page">> = [
          { kind: "person", value: `Pessoa da página ${page}`, normalizedValue: null, context: "parte nos autos" },
          { kind: "role", value: "Autora", normalizedValue: null, context: `papel da pessoa da página ${page}` },
          { kind: "date", value: `${day}/03/2026`, normalizedValue: `2026-03-${day}`, context: `data de um ato da página ${page}` },
          { kind: "amount", value: `R$ ${page}.000,00`, normalizedValue: `${page}000.00`, context: `valor pedido na página ${page}` },
          { kind: "event", value: `Juntada da página ${page}`, normalizedValue: null, context: "ato do processo" },
        ];
        return facts.map((fact) => ({ ...fact, page }));
      });
  }

  /** Each window as peças of two pages, of the next type in LAWSUIT, so fake mode shows a document map. */
  static twoPagePecas({ pages }: { pages: PageText[] }): { pecas: PecaDraft[]; facts: FactDraft[] } {
    const pecas: PecaDraft[] = [];
    for (let i = 0; i < pages.length; i += 2) {
      const { type, title } = LAWSUIT[(i / 2) % LAWSUIT.length]!;
      const firstPage = pages[i]!.page;
      const lastPage = pages[Math.min(i + 1, pages.length - 1)]!.page;
      pecas.push({ type, title, date: null, firstPage, lastPage, summary: `Resumo falso das páginas ${firstPage} a ${lastPage}.` });
    }
    return { pecas, facts: [] };
  }

  /** Counts the words it read as tokens, like the fake citing model. */
  async extract(input: { pages: PageText[]; openPeca: PecaDraft | null }) {
    const units = input.pages.reduce((total, page) => total + page.text.split(/\s+/).filter(Boolean).length, 0);
    return {
      ...this.script(input),
      usage: [{ kind: "extract" as const, provider: "fake", model: "fake-map-extractor", units, unit: "token" as const, costUsd: 0 }],
    };
  }
}
