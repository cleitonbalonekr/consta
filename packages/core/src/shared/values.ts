/** Inclusive range of page numbers, counted from 1 by position in the PDF. */
export type PageRange = { first: number; last: number };

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

export type QuickAction = "timeline" | "people" | "amounts";
