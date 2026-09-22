import type { FactDraft, MapExtractor, PecaDraft } from "../map-extractor";

type Script = (input: { pages: { page: number; text: string }[]; openPeca: PecaDraft | null }) => {
  pecas: PecaDraft[];
  facts: FactDraft[];
};

/** Returns scripted peças and facts. By default, each window is one "outro" peça with no facts. */
export class FakeMapExtractor implements MapExtractor {
  constructor(
    private readonly script: Script = ({ pages }) => ({
      pecas: [
        {
          type: "outro",
          title: "Peça falsa",
          date: null,
          firstPage: pages[0]?.page ?? 1,
          lastPage: pages.at(-1)?.page ?? 1,
          summary: "Resumo falso.",
        },
      ],
      facts: [],
    }),
  ) {}

  async extract(input: { pages: { page: number; text: string }[]; openPeca: PecaDraft | null }) {
    return {
      ...this.script(input),
      usage: [{ kind: "extract" as const, provider: "fake", model: "fake-map-extractor", units: 0, unit: "token" as const, costUsd: 0 }],
    };
  }
}
