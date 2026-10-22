import type { FactDraft, PageText, PecaDraft } from "../ports";
import { PageRange } from "../shared";

/** Splits a case file's pages into windows a model reads one at a time. */
export class PageWindows {
  /**
   * Consecutive pages, each window holding at most `maxChars` characters of text. A page
   * longer than that is a window alone, since a page is never split.
   */
  static plan(pages: { page: number; chars: number }[], maxChars: number): PageRange[] {
    const windows: PageRange[] = [];
    let start: { page: number; chars: number } | null = null;
    let last = 0;
    for (const { page, chars } of pages) {
      if (start && start.chars + chars > maxChars) {
        windows.push(PageRange.from(start.page, last));
        start = null;
      }
      start = start ? { page: start.page, chars: start.chars + chars } : { page, chars };
      last = page;
    }
    if (start) windows.push(PageRange.from(start.page, last));
    return windows;
  }
}

/**
 * The document map and facts as the windows are read, in page order. A peça that crosses a
 * window edge comes back from the next window starting before it: whatever first page the
 * model gave it, it is the open peça going on, so it replaces the open peça from the open
 * peça's first page, and the later reading, which saw more of it, wins. Of two such peças, the
 * one that goes furthest is kept; with no open peça, as in the first window, it starts at the
 * window's first page. What the model places past its window is dropped, and a peça ends at the
 * window's last page at the latest. A fact on a scanned page is dropped too: no statement comes
 * from a page the MVP does not read (ADR-0010).
 */
export class DocumentMapDraft {
  readonly pecas: PecaDraft[] = [];
  readonly facts: FactDraft[] = [];

  /** The last peça so far, which the next window may continue. */
  get openPeca(): PecaDraft | null {
    return this.pecas.at(-1) ?? null;
  }

  /** `pages` are the window's pages, in order, as the extractor read them. */
  add(pages: PageText[], read: { pecas: PecaDraft[]; facts: FactDraft[] }): void {
    const window = PageRange.from(pages[0]!.page, pages.at(-1)!.page);
    const inWindow = read.pecas
      .filter((peca) => peca.firstPage <= peca.lastPage && peca.lastPage >= window.first && peca.firstPage <= window.last)
      .map((peca) => ({ ...peca, lastPage: Math.min(peca.lastPage, window.last) }));
    this.continue(window, inWindow.filter((peca) => peca.firstPage < window.first));
    this.pecas.push(...inWindow.filter((peca) => peca.firstPage >= window.first).sort((a, b) => a.firstPage - b.firstPage));

    const digital = new Set(pages.filter((page) => page.source === "digital").map((page) => page.page));
    this.facts.push(...read.facts.filter((fact) => digital.has(fact.page)));
  }

  /** The peça that goes furthest of those begun before the window, as the open peça going on. */
  private continue(window: PageRange, begunBefore: PecaDraft[]) {
    const going = begunBefore.reduce<PecaDraft | null>((furthest, peca) => (!furthest || peca.lastPage > furthest.lastPage ? peca : furthest), null);
    if (!going) return;
    const open = this.openPeca;
    if (open) this.pecas[this.pecas.length - 1] = { ...going, firstPage: open.firstPage };
    else this.pecas.push({ ...going, firstPage: window.first });
  }
}
