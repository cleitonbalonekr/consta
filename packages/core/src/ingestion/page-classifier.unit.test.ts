import { describe, expect, it } from "vitest";
import type { Block } from "./page";
import { PageClassifier } from "./page-classifier";

const blocks = (...texts: string[]): Block[] => texts.map((text) => ({ text, box: { x0: 0, y0: 0, x1: 1, y1: 0.02 } }));

/** What e-SAJ writes up the margin of every page it serves, scans included. */
const E_SAJ_MARGIN = [
  "Este documento é cópia do original, assinado digitalmente por JOSE DA SILVA e Tribunal de Justica do Estado de Sao Paulo,",
  "protocolado em 10/03/2026 às 14:32 , sob o número 1000000-00.2026.8.26.0100.",
  "Para conferir o original, acesse o site https://esaj.tjsp.jus.br/pastadigital/pg/abrirConferenciaDocumento.do,",
  "informe o processo 1000000-00.2026.8.26.0100 e código 1A2B3C4D.",
];

/** What PJe writes at the foot of every page. */
const PJE_FOOTER = [
  "Assinado eletronicamente por: FULANO DE TAL - 10/03/2026 14:32:10",
  "https://pje1g.trf1.jus.br:443/pje/Processo/ConsultaDocumento/listView.seam?x=26031014321000000000123456789",
  "Número do documento: 26031014321000000000123456789",
  "Num. 123456789 - Pág. 1",
];

describe("PageClassifier", () => {
  it("classifies a page of court text as digital", () => {
    const page = blocks("fls. 12", "EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA 1ª VARA CÍVEL", "MARIA APARECIDA SOUZA, brasileira, vem propor", ...E_SAJ_MARGIN);

    expect(PageClassifier.classify(page)).toBe("digital");
  });

  it("classifies a short digital page, such as a signature page, as digital", () => {
    expect(PageClassifier.classify(blocks("São Paulo, 10 de março de 2026.", "Fulano de Tal, OAB/SP 123.456"))).toBe("digital");
  });

  it("classifies a page with no text layer as scanned", () => {
    expect(PageClassifier.classify([])).toBe("scanned");
  });

  it("classifies an e-SAJ scan, which has only the folha stamp and the margin signature, as scanned", () => {
    expect(PageClassifier.classify(blocks("fls. 57", ...E_SAJ_MARGIN))).toBe("scanned");
  });

  it("classifies a PJe scan, which has only the signature footer, as scanned", () => {
    expect(PageClassifier.classify(blocks(...PJE_FOOTER))).toBe("scanned");
  });

  it("classifies a scan with a few stray characters in its text layer as scanned", () => {
    expect(PageClassifier.classify(blocks("~ ,. ;", "l I 1", "fls. 3"))).toBe("scanned");
  });
});
