import { describe, expect, it } from "vitest";
import type { FactDraft, PageText, PecaDraft } from "../ports";
import { DocumentMapDraft, PageWindows } from "./document-map";

const peca = (firstPage: number, lastPage: number, fields: Partial<PecaDraft> = {}): PecaDraft => ({
  type: "outro",
  title: `Peça ${firstPage}`,
  date: null,
  firstPage,
  lastPage,
  summary: `Resumo ${firstPage}.`,
  ...fields,
});

const fact = (page: number, value = `Fato ${page}`): FactDraft => ({ kind: "event", value, normalizedValue: null, context: value, page });

const ranges = (windows: { first: number; last: number }[]) => windows.map(({ first, last }) => [first, last]);

/** The pages of a window from `first` to `last`, digital but for the `scanned` ones. */
const pages = (first: number, last: number, scanned: number[] = []): PageText[] =>
  Array.from({ length: last - first + 1 }, (_, i) => first + i).map((page) => ({
    page,
    text: scanned.includes(page) ? "" : `Página ${page}`,
    source: scanned.includes(page) ? "scanned" : "digital",
  }));

describe("PageWindows.plan", () => {
  it("groups consecutive pages into windows whose text stays under the budget", () => {
    const pages = [1, 2, 3, 4, 5].map((page) => ({ page, chars: 400 }));

    expect(ranges(PageWindows.plan(pages, 1_000))).toEqual([
      [1, 2],
      [3, 4],
      [5, 5],
    ]);
  });

  it("gives a page longer than the budget a window of its own", () => {
    const pages = [
      { page: 1, chars: 300 },
      { page: 2, chars: 5_000 },
      { page: 3, chars: 300 },
    ];

    expect(ranges(PageWindows.plan(pages, 1_000))).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });

  it("plans no window for a case file without pages", () => {
    expect(PageWindows.plan([], 1_000)).toEqual([]);
  });
});

describe("DocumentMapDraft", () => {
  it("keeps the peças and facts of each window, in page order", () => {
    const map = new DocumentMapDraft();

    map.add(pages(1, 10), { pecas: [peca(1, 4), peca(5, 10)], facts: [fact(2)] });
    map.add(pages(11, 20), { pecas: [peca(11, 20)], facts: [fact(15)] });

    expect(map.pecas.map((p) => [p.firstPage, p.lastPage])).toEqual([
      [1, 4],
      [5, 10],
      [11, 20],
    ]);
    expect(map.facts.map((f) => f.page)).toEqual([2, 15]);
  });

  it("offers the last peça of a window as open, so the next window can continue it", () => {
    const map = new DocumentMapDraft();
    expect(map.openPeca).toBeNull();

    map.add(pages(1, 10), { pecas: [peca(1, 4), peca(5, 10)], facts: [] });

    expect(map.openPeca).toMatchObject({ firstPage: 5, lastPage: 10 });
  });

  it("merges a peça that continues across a window edge into one peça, with the later window's reading of it", () => {
    const map = new DocumentMapDraft();
    map.add(pages(1, 10), { pecas: [peca(1, 4), peca(5, 10, { type: "contestacao", summary: "Início." })], facts: [] });

    map.add(pages(11, 20), {
      pecas: [peca(5, 14, { type: "contestacao", summary: "A contestação inteira." }), peca(15, 20)],
      facts: [],
    });

    expect(map.pecas.map((p) => [p.firstPage, p.lastPage, p.summary])).toEqual([
      [1, 4, "Resumo 1."],
      [5, 14, "A contestação inteira."],
      [15, 20, "Resumo 15."],
    ]);
  });

  it("merges a peça that spans three windows", () => {
    const map = new DocumentMapDraft();

    map.add(pages(1, 10), { pecas: [peca(1, 10)], facts: [] });
    map.add(pages(11, 20), { pecas: [peca(1, 20)], facts: [] });
    map.add(pages(21, 30), { pecas: [peca(1, 25), peca(26, 30)], facts: [] });

    expect(map.pecas.map((p) => [p.firstPage, p.lastPage])).toEqual([
      [1, 25],
      [26, 30],
    ]);
  });

  it("takes a peça that starts before the window as the open peça going on, whatever first page the model gave it", () => {
    const map = new DocumentMapDraft();
    map.add(pages(1, 10), { pecas: [peca(1, 4), peca(5, 10, { title: "Contestação" })], facts: [] });

    map.add(pages(11, 20), { pecas: [peca(8, 13, { title: "Contestação, até a página 13" }), peca(14, 20)], facts: [] });

    expect(map.pecas.map((p) => [p.firstPage, p.lastPage, p.title])).toEqual([
      [1, 4, "Peça 1"],
      [5, 13, "Contestação, até a página 13"],
      [14, 20, "Peça 14"],
    ]);
  });

  it("starts a peça the model began before the first window at the window's first page, and drops what it placed past the window", () => {
    const map = new DocumentMapDraft();

    map.add(pages(11, 20), {
      // No peça is open before the first window; 25 is past the window.
      pecas: [peca(3, 12), peca(13, 18), peca(19, 24), peca(25, 30)],
      facts: [fact(9), fact(12), fact(21)],
    });

    expect(map.pecas.map((p) => [p.firstPage, p.lastPage])).toEqual([
      [11, 12],
      [13, 18],
      [19, 20],
    ]);
    expect(map.facts.map((f) => f.page)).toEqual([12]);
  });

  it("keeps, of two peças the model began before the window, the one that goes furthest as the open peça going on", () => {
    const map = new DocumentMapDraft();
    map.add(pages(1, 10), { pecas: [peca(1, 4), peca(5, 10)], facts: [] });

    map.add(pages(11, 20), {
      pecas: [peca(5, 16, { title: "Contestação inteira" }), peca(8, 12, { title: "Um anexo" }), peca(17, 20)],
      facts: [],
    });

    expect(map.pecas.map((p) => [p.firstPage, p.lastPage, p.title])).toEqual([
      [1, 4, "Peça 1"],
      [5, 16, "Contestação inteira"],
      [17, 20, "Peça 17"],
    ]);
  });

  it("drops a fact on a scanned page, since no statement comes from an unread page (ADR-0010)", () => {
    const map = new DocumentMapDraft();

    map.add(pages(1, 3, [2]), { pecas: [peca(1, 3)], facts: [fact(1), fact(2), fact(3)] });

    expect(map.facts.map((f) => f.page)).toEqual([1, 3]);
  });

  it("drops a peça whose last page comes before its first", () => {
    const map = new DocumentMapDraft();

    map.add(pages(1, 10), { pecas: [peca(6, 4), peca(1, 10)], facts: [] });

    expect(map.pecas.map((p) => [p.firstPage, p.lastPage])).toEqual([[1, 10]]);
  });
});
