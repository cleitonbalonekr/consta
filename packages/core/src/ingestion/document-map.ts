import type { FactDraft, PecaDraft } from "../ports";
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
 * peça's first page, and the later reading, which saw more of it, wins. What the model places
 * outside its window is dropped, and a peça ends at the window's last page at the latest.
 */
export class DocumentMapDraft {
  readonly pecas: PecaDraft[] = [];
  readonly facts: FactDraft[] = [];

  /** The last peça so far, which the next window may continue. */
  get openPeca(): PecaDraft | null {
    return this.pecas.at(-1) ?? null;
  }

  add(window: PageRange, read: { pecas: PecaDraft[]; facts: FactDraft[] }): void {
    const open = this.openPeca;
    const pecas = read.pecas
      .filter((peca) => peca.firstPage <= peca.lastPage && peca.lastPage >= window.first && peca.firstPage <= window.last)
      .map((peca) => ({ ...peca, lastPage: Math.min(peca.lastPage, window.last) }))
      .sort((a, b) => a.firstPage - b.firstPage);
    for (const peca of pecas) {
      if (peca.firstPage >= window.first) this.pecas.push(peca);
      else if (open) this.pecas[this.pecas.length - 1] = { ...peca, firstPage: open.firstPage };
    }
    this.facts.push(...read.facts.filter((fact) => window.contains(fact.page)));
  }
}
