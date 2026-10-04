/**
 * The text of the seeded demo case file, one array of lines per page, and the
 * layout that places each line. `scripts/write-sample-pdf.ts` writes
 * `public/demo/autos-de-exemplo.pdf` from this file, and the demo citations take
 * their quotes and boxes from it, so the marks land on the quoted lines.
 * After editing, run `pnpm --filter @consta/web demo:pdf`.
 */

export type SamplePage = { folha: string | null; lines: string[] };

export const SAMPLE_PAGES: SamplePage[] = [
  {
    folha: null,
    lines: [
      "PODER JUDICIÁRIO",
      "TRIBUNAL DE JUSTIÇA DO ESTADO DE SÃO PAULO",
      "",
      "Processo nº 0000000-00.2026.8.26.0000",
      "Classe: Procedimento Comum Cível",
      "Assunto: Indenização por Dano Moral",
      "Autora: Maria Aparecida Souza",
      "Réu: Banco Exemplo S.A.",
      "Distribuído em 10/02/2026 à 1ª Vara Cível do Foro Central",
      "",
      "Autos de demonstração. Pessoas, valores e fatos são fictícios.",
    ],
  },
  {
    folha: "2",
    lines: [
      "EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA 1ª VARA CÍVEL",
      "",
      "MARIA APARECIDA SOUZA, brasileira, professora, vem propor a presente",
      "AÇÃO DE INDENIZAÇÃO POR DANOS MORAIS em face de BANCO EXEMPLO S.A.",
      "",
      "I - DOS FATOS",
      "A autora quitou em 20/12/2025 a parcela de R$ 4.250,00 do contrato",
      "de empréstimo nº 123456, conforme comprovante anexo.",
      "Mesmo assim, em 15/01/2026, o réu inscreveu o nome da autora no",
      "cadastro de inadimplentes pela mesma dívida já paga.",
      "A autora só soube da inscrição ao ter o crédito negado no comércio.",
    ],
  },
  {
    folha: "3",
    lines: [
      "II - DO DIREITO",
      "A inscrição indevida em cadastro de inadimplentes gera dano moral",
      "presumido, conforme a jurisprudência do Superior Tribunal de Justiça.",
      "",
      "III - DOS PEDIDOS",
      "a) a exclusão imediata do nome da autora do cadastro de inadimplentes;",
      "b) a condenação do réu ao pagamento de R$ 20.000,00 por danos morais;",
      "c) a condenação do réu nas custas e honorários advocatícios.",
      "",
      "Dá-se à causa o valor de R$ 20.000,00.",
      "São Paulo, 9 de fevereiro de 2026. Pedro Henrique Alves, OAB/SP 123.456",
    ],
  },
  {
    folha: "4",
    lines: [
      "PROCURAÇÃO",
      "",
      "Outorgante: Maria Aparecida Souza.",
      "Outorgado: Pedro Henrique Alves, advogado, OAB/SP 123.456.",
      "Poderes: os da cláusula ad judicia, para o foro em geral.",
      "São Paulo, 5 de fevereiro de 2026.",
    ],
  },
  {
    folha: "5",
    lines: [
      "CONTESTAÇÃO",
      "",
      "BANCO EXEMPLO S.A., nos autos da ação movida por MARIA APARECIDA SOUZA,",
      "vem apresentar contestação.",
      "",
      "O réu alega que o pagamento de 20/12/2025 foi feito após o vencimento",
      "da parcela, ocorrido em 10/12/2025, e que a inscrição foi regular.",
      "Sustenta que não houve dano moral, pois a autora não provou prejuízo.",
    ],
  },
  {
    folha: "6",
    lines: [
      "Subsidiariamente, pede que eventual indenização não passe de",
      "R$ 2.000,00, para evitar enriquecimento sem causa.",
      "",
      "Requer a improcedência total dos pedidos.",
      "São Paulo, 16 de março de 2026. Carla Mendes Rocha, OAB/SP 654.321",
    ],
  },
  {
    folha: "7",
    lines: [
      "DESPACHO",
      "",
      "Designo audiência de instrução para 12/05/2026, às 14h.",
      "Intimem-se as partes para apresentar rol de testemunhas.",
      "São Paulo, 2 de abril de 2026. Ana Beatriz Costa, Juíza de Direito",
    ],
  },
  {
    folha: "8",
    lines: [
      "TERMO DE AUDIÊNCIA DE INSTRUÇÃO",
      "",
      "Aos 12/05/2026, presentes a autora, o preposto do réu e os advogados.",
      "Ouvida a testemunha João Pereira Lima, gerente da agência, que",
      "confirmou ter recebido o pagamento da autora em 20/12/2025.",
      "A testemunha disse ainda que a baixa da dívida não foi registrada.",
      "Encerrada a instrução, as partes apresentaram alegações orais.",
    ],
  },
  {
    folha: "9",
    lines: [
      "SENTENÇA",
      "",
      "Vistos. Trata-se de ação de indenização por danos morais movida por",
      "Maria Aparecida Souza em face de Banco Exemplo S.A.",
      "A prova oral confirmou que a dívida foi paga antes da inscrição.",
      "A inscrição indevida causa dano moral, independentemente de prova.",
    ],
  },
  {
    folha: "10",
    lines: [
      "Ante o exposto, JULGO PROCEDENTE o pedido para:",
      "a) determinar a exclusão do nome da autora do cadastro de inadimplentes;",
      "b) condenar o réu ao pagamento de R$ 10.000,00 por danos morais,",
      "com correção monetária desde esta data e juros desde 15/01/2026.",
      "Condeno o réu nas custas e em honorários de 15% do valor da condenação.",
      "São Paulo, 30 de junho de 2026. Ana Beatriz Costa, Juíza de Direito",
    ],
  },
];

/** A4 in PDF points, with one column of 11 pt Helvetica. */
export const SAMPLE_LAYOUT = {
  width: 595,
  height: 842,
  marginX: 72,
  firstBaseline: 740,
  leading: 20,
  fontSize: 11,
  folha: { x: 480, y: 790, fontSize: 10 },
} as const;

/** Baseline of a line, in PDF points from the bottom of the page. */
export function lineBaseline(line: number) {
  return SAMPLE_LAYOUT.firstBaseline - line * SAMPLE_LAYOUT.leading;
}

// Helvetica character widths in em, averaged by class. The box only has to
// cover the line, so an estimate is enough and keeps pdf-lib out of the app.
function emWidth(char: string) {
  if (char === " " || /[.,;:'!|ilI]/.test(char)) return 0.28;
  if (/[frtj]/.test(char)) return 0.33;
  if (/\p{Lu}/u.test(char)) return 0.69;
  if (/[mw%]/.test(char)) return 0.85;
  return 0.56;
}

/** The box of one line, in fractions of the page (origin top-left), padded a little. */
export function lineBox(page: SamplePage, line: number) {
  const { width, height, marginX, fontSize } = SAMPLE_LAYOUT;
  const text = page.lines[line] ?? "";
  const ems = [...text].reduce((total, char) => total + emWidth(char), 0);
  const textWidth = Math.min(ems * fontSize, width - 2 * marginX);
  const baseline = lineBaseline(line);
  return {
    x0: (marginX - 3) / width,
    y0: (height - baseline - fontSize - 3) / height,
    x1: (marginX + textWidth + 3) / width,
    y1: (height - baseline + 5) / height,
  };
}
