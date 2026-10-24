import { InvalidPageRange } from "./errors";

/** Inclusive range of page numbers, counted from 1 by position in the PDF. */
export class PageRange {
  private constructor(
    readonly first: number,
    readonly last: number,
  ) {}

  /** Throws InvalidPageRange unless `first` is 1 or more and not more than `last`. */
  static from(first: number, last: number): PageRange {
    if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || first > last) {
      throw new InvalidPageRange(first, last);
    }
    return new PageRange(first, last);
  }

  contains(page: number): boolean {
    return page >= this.first && page <= this.last;
  }

  /** Pages in order as the fewest ranges: [3, 4, 5, 9] as 3 to 5 and 9 to 9. */
  static group(pages: number[]): PageRange[] {
    const ranges: Array<{ first: number; last: number }> = [];
    for (const page of pages) {
      const last = ranges.at(-1);
      if (last && last.last + 1 === page) last.last = page;
      else ranges.push({ first: page, last: page });
    }
    return ranges.map(({ first, last }) => PageRange.from(first, last));
  }
}

/** A day of the calendar as YYYY-MM-DD, the form the date columns store. */
export class CalendarDate {
  private static readonly FORM = /^(\d{4})-(\d{2})-(\d{2})$/;

  private constructor(readonly iso: string) {}

  /**
   * Null unless `text` is YYYY-MM-DD and names a real day. A model writes 2026-02-30, or a 00
   * day or month when it doesn't know them; such a date would fail the whole insert.
   */
  static parse(text: string): CalendarDate | null {
    const match = CalendarDate.FORM.exec(text);
    if (!match) return null;
    // FORM has three groups, so the match has three numbers after the whole text.
    const [year, month, day] = match.slice(1).map(Number) as [number, number, number];
    const date = new Date(Date.UTC(year, month - 1, day));
    const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
    return real ? new CalendarDate(text) : null;
  }
}

/** A rectangle on a page, in fractions of the page width and height (0 to 1, origin top-left). */
export type Box = { x0: number; y0: number; x1: number; y1: number };

export const pageSources = ["digital", "scanned"] as const;
export type PageSource = (typeof pageSources)[number];

export const caseFileStatuses = [
  "uploading",
  "queued",
  "processing",
  "mapping",
  "ready",
  "failed",
  "deleting",
] as const;
export type CaseFileStatus = (typeof caseFileStatuses)[number];

export const pecaTypes = [
  "peticao-inicial",
  "contestacao",
  "replica",
  "despacho",
  "decisao",
  "sentenca",
  "acordao",
  "recurso",
  "laudo",
  "ata-de-audiencia",
  "procuracao",
  "documento",
  "outro",
] as const;
export type PecaType = (typeof pecaTypes)[number];

export const factKinds = ["person", "role", "date", "amount", "event"] as const;
export type FactKind = (typeof factKinds)[number];

export const plans = ["trial", "pro", "enterprise"] as const;
export type Plan = (typeof plans)[number];

/** What a question is about: the whole case file, or one peça. */
export const scopeKinds = ["whole-file", "peca"] as const;
export type ScopeKind = (typeof scopeKinds)[number];

export const quickActions = ["timeline", "people", "amounts"] as const;
export type QuickAction = (typeof quickActions)[number];

/** What a paid provider call was for, in the order the operator's cost page shows them. */
export const usageKinds = ["ocr", "embed", "rerank", "extract", "answer"] as const;
export type UsageKind = (typeof usageKinds)[number];
