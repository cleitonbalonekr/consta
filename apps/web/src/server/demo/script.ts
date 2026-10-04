import { PecaId } from "@consta/core";
import type { Citation, PecaType, PecaView, QuickAction } from "@consta/core";
import { lineBox, SAMPLE_PAGES } from "./sample-pages";

/** A scripted statement. Unlike `Statement`, it may have no citation, so the demo can show that those are dropped. */
export type DraftStatement = { text: string; citations: Citation[] };

/** Everything the demo knows about one case file: its document map and the answers it plays back. */
export type DemoScript = {
  documentMap: PecaView[];
  wholeFile: DraftStatement[];
  byPeca: Map<PecaId, DraftStatement[]>;
  quickActions: Record<QuickAction, DraftStatement[]>;
};

/** Quotes whole lines of a sample page, marking each one. */
function cite(page: number, ...lines: number[]): Citation {
  const samplePage = SAMPLE_PAGES[page - 1]!;
  return {
    page,
    folha: samplePage.folha,
    quote: lines.map((line) => samplePage.lines[line]).join(" "),
    boxes: lines.map((line) => lineBox(samplePage, line)),
  };
}

function peca(id: string, type: PecaType, title: string, date: string, pages: [number, number], summary: string): PecaView {
  return { id: PecaId(id), type, title, date, firstPage: pages[0], lastPage: pages[1], summary };
}

/** The script of the seeded case file, quoting `public/demo/autos-de-exemplo.pdf`. */
export function sampleScript(): DemoScript {
  const documentMap = [
    peca("sample-capa", "outro", "Capa dos autos", "2026-02-10", [1, 1], "Autuação do processo, com as partes, a classe e a vara."),
    peca("sample-inicial", "peticao-inicial", "Petição inicial", "2026-02-09", [2, 3], "A autora diz que pagou a parcela do empréstimo e mesmo assim foi inscrita no cadastro de inadimplentes. Pede a exclusão do cadastro e R$ 20.000,00 por danos morais."),
    peca("sample-procuracao", "procuracao", "Procuração", "2026-02-05", [4, 4], "A autora constitui o advogado Pedro Henrique Alves."),
    peca("sample-contestacao", "contestacao", "Contestação", "2026-03-16", [5, 6], "O réu diz que o pagamento foi feito depois do vencimento e que não houve dano moral. Pede, se condenado, indenização de no máximo R$ 2.000,00."),
    peca("sample-despacho", "despacho", "Despacho que designa audiência", "2026-04-02", [7, 7], "Designa a audiência de instrução para 12/05/2026."),
    peca("sample-audiencia", "ata-de-audiencia", "Termo de audiência de instrução", "2026-05-12", [8, 8], "A testemunha João Pereira Lima confirma o pagamento feito pela autora em 20/12/2025."),
    peca("sample-sentenca", "sentenca", "Sentença", "2026-06-30", [9, 10], "Julga procedente o pedido e condena o réu a pagar R$ 10.000,00 por danos morais."),
  ];

  return {
    documentMap,
    wholeFile: [
      { text: "A autora pede indenização por danos morais porque o réu inscreveu seu nome no cadastro de inadimplentes por uma dívida que ela já tinha pago.", citations: [cite(2, 8, 9), cite(2, 6, 7)] },
      // Scripted without a citation: it must never reach the lawyer (ADR-0003).
      { text: "O réu costuma fazer acordo nesse tipo de ação.", citations: [] },
      { text: "O réu alega que o pagamento foi feito depois do vencimento e que a inscrição foi regular.", citations: [cite(5, 5, 6)] },
      { text: "A testemunha João Pereira Lima confirmou que a autora pagou a parcela em 20/12/2025.", citations: [cite(8, 3, 4)] },
      { text: "A sentença julgou o pedido procedente e condenou o réu a pagar R$ 10.000,00 por danos morais.", citations: [cite(10, 0), cite(10, 2)] },
    ],
    byPeca: new Map([
      [documentMap[0]!.id, [{ text: "O processo foi distribuído em 10/02/2026 à 1ª Vara Cível do Foro Central.", citations: [cite(1, 8)] }]],
      [documentMap[1]!.id, [
        { text: "A autora afirma que pagou a parcela de R$ 4.250,00 em 20/12/2025 e que foi inscrita no cadastro de inadimplentes em 15/01/2026.", citations: [cite(2, 6), cite(2, 8, 9)] },
        { text: "Ela pede a exclusão do cadastro e R$ 20.000,00 por danos morais.", citations: [cite(3, 5, 6)] },
      ]],
      [documentMap[2]!.id, [{ text: "A autora deu ao advogado Pedro Henrique Alves os poderes da cláusula ad judicia.", citations: [cite(4, 3, 4)] }]],
      [documentMap[3]!.id, [
        { text: "O réu alega que a parcela venceu em 10/12/2025 e que a inscrição foi regular.", citations: [cite(5, 5, 6)] },
        { text: "Se houver condenação, pede que a indenização não passe de R$ 2.000,00.", citations: [cite(6, 0, 1)] },
      ]],
      [documentMap[4]!.id, [{ text: "O juízo designou a audiência de instrução para 12/05/2026, às 14h.", citations: [cite(7, 2)] }]],
      [documentMap[5]!.id, [{ text: "A testemunha confirmou o pagamento em 20/12/2025 e disse que a baixa da dívida não foi registrada.", citations: [cite(8, 3, 4), cite(8, 5)] }]],
      [documentMap[6]!.id, [
        { text: "A sentença considerou provado que a dívida foi paga antes da inscrição.", citations: [cite(9, 4)] },
        { text: "O réu foi condenado a pagar R$ 10.000,00 por danos morais, com juros desde 15/01/2026.", citations: [cite(10, 2, 3)] },
      ]],
    ]),
    quickActions: {
      timeline: [
        { text: "20/12/2025: a autora paga a parcela de R$ 4.250,00.", citations: [cite(2, 6)] },
        { text: "15/01/2026: o réu inscreve o nome da autora no cadastro de inadimplentes.", citations: [cite(2, 8)] },
        { text: "10/02/2026: a ação é distribuída à 1ª Vara Cível.", citations: [cite(1, 8)] },
        { text: "16/03/2026: o réu apresenta contestação.", citations: [cite(6, 4)] },
        { text: "12/05/2026: audiência de instrução com a oitiva de uma testemunha.", citations: [cite(8, 2)] },
        { text: "30/06/2026: sentença de procedência.", citations: [cite(10, 5)] },
      ],
      people: [
        { text: "Maria Aparecida Souza: autora.", citations: [cite(1, 6)] },
        { text: "Banco Exemplo S.A.: réu.", citations: [cite(1, 7)] },
        { text: "Pedro Henrique Alves: advogado da autora.", citations: [cite(4, 3)] },
        { text: "Carla Mendes Rocha: advogada do réu.", citations: [cite(6, 4)] },
        { text: "João Pereira Lima: testemunha, gerente da agência.", citations: [cite(8, 3)] },
        { text: "Ana Beatriz Costa: juíza de direito.", citations: [cite(10, 5)] },
      ],
      amounts: [
        { text: "R$ 4.250,00: parcela do empréstimo paga pela autora.", citations: [cite(2, 6)] },
        { text: "R$ 20.000,00: indenização pedida e valor da causa.", citations: [cite(3, 6), cite(3, 9)] },
        { text: "R$ 2.000,00: teto da indenização proposto pelo réu.", citations: [cite(6, 0, 1)] },
        { text: "R$ 10.000,00: indenização fixada na sentença.", citations: [cite(10, 2)] },
      ],
    },
  };
}

const GENERATED_PECAS: Array<{ type: PecaType; title: string }> = [
  { type: "peticao-inicial", title: "Petição inicial" },
  { type: "contestacao", title: "Contestação" },
  { type: "sentenca", title: "Sentença" },
];

/** The demo can't read an uploaded PDF, so its citations mark the top of the cited page. */
function placeholderCitation(page: number): Citation {
  return {
    page,
    folha: null,
    quote: `Trecho de demonstração da página ${page}.`,
    boxes: [{ x0: 0.1, y0: 0.08, x1: 0.9, y1: 0.14 }],
  };
}

/** A script for an uploaded case file: up to three peças that split its pages evenly. */
export function generatedScript(caseFileId: string, pageCount: number): DemoScript {
  const pecaShapes = pageCount === 1 ? [{ type: "documento" as const, title: "Documento" }] : GENERATED_PECAS.slice(0, Math.min(3, pageCount));
  // Peça i ends where its share of the pages ends, so every page lands in exactly one peça.
  const lastPageOf = (index: number) => Math.round(((index + 1) * pageCount) / pecaShapes.length);
  const documentMap = pecaShapes.map((shape, index) => ({
    id: PecaId(`${caseFileId}-peca-${index + 1}`),
    type: shape.type,
    title: shape.title,
    date: null,
    firstPage: index === 0 ? 1 : lastPageOf(index - 1) + 1,
    lastPage: lastPageOf(index),
    summary: `Resumo de demonstração da peça "${shape.title}".`,
  }));
  const about = (peca: PecaView) => ({
    text: `A peça "${peca.title}" ocupa as páginas ${peca.firstPage} a ${peca.lastPage}.`,
    citations: [placeholderCitation(peca.firstPage)],
  });

  return {
    documentMap,
    wholeFile: [...documentMap.map(about), { text: "Esta afirmação não tem citação.", citations: [] }],
    byPeca: new Map(documentMap.map((peca) => [peca.id, [about(peca)]])),
    quickActions: {
      timeline: documentMap.map((peca) => ({ text: `Juntada da peça "${peca.title}".`, citations: [placeholderCitation(peca.firstPage)] })),
      people: [{ text: "Parte autora, conforme a primeira página.", citations: [placeholderCitation(1)] }],
      amounts: [{ text: "Valor da causa, conforme a primeira página.", citations: [placeholderCitation(1)] }],
    },
  };
}
