import { describe, expect, it } from "vitest";
import { Folha } from "./folha";
import type { Block } from "./page";

/** A block at a height on the page, 0 at the top. */
function block(text: string, top = 0.5): Block {
  return { text, box: { x0: 0.1, y0: top, x1: 0.9, y1: top + 0.02 } };
}

describe("Folha", () => {
  it.each([
    ["fls. 123", "123"],
    ["Fls. 7", "7"],
    ["FLS. 1.234", "1234"],
    ["fls.: 45", "45"],
    ["fls 45", "45"],
    ["fl. 9", "9"],
    ["fls. 45v", "45v"],
    ["fls. 45-verso", "45v"],
    ["  fls. 300  ", "300"],
  ])("reads the stamp %j as folha %s", (text, folha) => {
    expect(Folha.read([block("PODER JUDICIÁRIO"), block(text, 0.02)])).toBe(folha);
  });

  it("leaves it empty when the page has no stamp, as on PJe pages", () => {
    const pje = [
      block("Assinado eletronicamente por: FULANO DE TAL - 10/03/2026 14:32:10", 0.95),
      block("Num. 123456789 - Pág. 1", 0.97),
      block("O autor requer a citação do réu."),
    ];

    expect(Folha.read(pje)).toBeNull();
  });

  it("does not take a folha mentioned in a sentence for the stamp", () => {
    expect(Folha.read([block("conforme os documentos de fls. 12/15, o réu foi citado."), block("às fls. 45")])).toBeNull();
  });

  it("takes the top stamp when a page has two, as when a page was renumbered", () => {
    expect(Folha.read([block("fls. 88", 0.9), block("fls. 120", 0.03)])).toBe("120");
  });
});
