import type { PageSource } from "../shared";
import { Folha } from "./folha";
import type { Block } from "./page";

/** Fewer letters than this, after the stamps are removed, is not usable text. */
const MIN_LETTERS = 20;

/**
 * Text that court systems add to every page, scanned pages too: the e-SAJ margin
 * ("Este documento é cópia do original, assinado digitalmente por…") and the PJe footer
 * ("Assinado eletronicamente por…", "Num. 123 - Pág. 1"). It says nothing about the page itself.
 */
const STAMP_MARKERS = [
  /cópia do original/i,
  /assinado (digital|eletronica)mente/i,
  /para conferir o original/i,
  /protocolado em/i,
  /informe o processo/i,
  /liberado nos autos digitais/i,
  /número do documento/i,
  /^num\.\s*\d+\s*-\s*pág\.\s*\d+$/i,
  /^https?:\/\/\S+$/i,
];

/** Tells a digital page from a scanned one by its text layer (ADR-0010). */
export class PageClassifier {
  /** `digital` when the page has usable text besides court stamps; `scanned` otherwise. */
  static classify(blocks: readonly Block[]): PageSource {
    const letters = blocks
      .filter((block) => !isStamp(block.text))
      .reduce((total, block) => total + (block.text.match(/\p{L}/gu)?.length ?? 0), 0);
    return letters >= MIN_LETTERS ? "digital" : "scanned";
  }
}

function isStamp(text: string) {
  const trimmed = text.trim();
  return Folha.isStamp(trimmed) || STAMP_MARKERS.some((marker) => marker.test(trimmed));
}
