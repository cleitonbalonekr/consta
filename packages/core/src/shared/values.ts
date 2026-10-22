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
}

/** A rectangle on a page, in fractions of the page width and height (0 to 1, origin top-left). */
export type Box = { x0: number; y0: number; x1: number; y1: number };

export type PageSource = "digital" | "scanned";

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
