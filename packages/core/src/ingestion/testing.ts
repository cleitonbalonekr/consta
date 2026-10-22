// Test helpers for the Ingestion tests, unit and integration. Not part of the module's interface.
import { degrees, PDFDocument, StandardFonts } from "pdf-lib";
import type { PDFFont, PDFPage } from "pdf-lib";
import { CaseFileLifecycle, CaseFiles } from "../case-files";
import { Metering } from "../metering";
import { FakeEmbedder, InlineJobs, InMemoryFileStore, RecordingJobs } from "../ports/fakes";
import type { Embedder, UnitOfWork } from "../ports";
import type { CaseFileId, LawyerId } from "../shared";
import { Ingestion } from "./index";

/** A page of a fixture PDF: court text, two columns of text, or a scan with only the court's stamps. */
export type FixturePage = "digital" | "two-column" | "scanned";

/** A 1×1 grey PNG, stretched over a scanned page. */
const SCAN = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNoAAAAggCBd81ytgAAAABJRU5ErkJggg=="), (c) =>
  c.charCodeAt(0),
);

const SIZE = 11;

/** A real PDF with the given pages. Every page has a "fls." stamp: page n is folha n + 1, as in a file with a cover sheet. */
export async function fixturePdf(pages: FixturePage[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const scan = await pdf.embedPng(SCAN);
  pages.forEach((kind, index) => {
    const page = pdf.addPage([595, 842]);
    const number = index + 1;
    if (kind === "scanned") page.drawImage(scan, { x: 0, y: 0, width: 595, height: 842 });
    page.drawText(`fls. ${number + 1}`, { x: 480, y: 800, size: 10, font });
    eSajMargin(page, font);
    if (kind === "digital") drawLines(page, font, 72, digitalLines(number));
    if (kind === "two-column") twoColumns(page, font);
  });
  return pdf.save();
}

/** Lines of a digital page. Each names its page, so a test can tell where a passage came from. */
export function digitalLines(page: number): string[] {
  return [
    `Página ${page}: EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA 1ª VARA CÍVEL`,
    `Página ${page}: MARIA APARECIDA SOUZA, brasileira, professora, vem propor a presente`,
    `Página ${page}: AÇÃO DE INDENIZAÇÃO POR DANOS MORAIS em face de BANCO EXEMPLO S.A.,`,
    `Página ${page}: conforme os documentos de fls. 12/15, pelos fatos a seguir expostos.`,
  ];
}

export const LEFT_COLUMN = ["A autora alega que o banco", "inscreveu seu nome no cadastro", "de inadimplentes sem aviso."];
export const RIGHT_COLUMN = ["O réu contesta e afirma que", "a dívida existia e que avisou", "a autora por carta registrada."];

/** Left column first, then the right one, as most PDF writers draw them. */
function twoColumns(page: PDFPage, font: PDFFont) {
  drawLines(page, font, 72, LEFT_COLUMN);
  drawLines(page, font, 320, RIGHT_COLUMN);
}

function drawLines(page: PDFPage, font: PDFFont, x: number, lines: string[]) {
  lines.forEach((line, i) => page.drawText(line, { x, y: 740 - i * 20, size: SIZE, font }));
}

/** The e-SAJ signature, written up the left margin of every page, scanned pages too. */
function eSajMargin(page: PDFPage, font: PDFFont) {
  const lines = [
    "Este documento é cópia do original, assinado digitalmente por JOSE DA SILVA, protocolado em 10/03/2026 às 14:32,",
    "sob o número 1000000-00.2026.8.26.0100. Para conferir o original, acesse o site https://esaj.tjsp.jus.br/pastadigital,",
  ];
  lines.forEach((line, i) => page.drawText(line, { x: 20 + i * 8, y: 60, size: 6, font, rotate: degrees(90) }));
}

/**
 * The modules that ingestion needs, on the given unit of work. InlineJobs starts ingestion
 * when an upload finishes; with `startIngestion: false`, the test runs the steps itself.
 */
export function ingestionOn(uow: UnitOfWork, options: { embedder?: Embedder; startIngestion?: boolean } = {}) {
  const { embedder = new FakeEmbedder(), startIngestion = true } = options;
  const files = new InMemoryFileStore();
  const metering = new Metering({ uow });
  const lifecycle = new CaseFileLifecycle({ uow });
  const ingestion = new Ingestion({ uow, files, embedder, metering, lifecycle });
  const jobs = new InlineJobs(() => (caseFileId) => ingestion.ingest(caseFileId));
  const caseFiles = new CaseFiles({ uow, files, jobs: startIngestion ? jobs : new RecordingJobs(), metering });

  /** What the browser does: uploads the PDF and finishes the upload, which starts ingestion. */
  async function upload(lawyer: LawyerId, pdf: Uint8Array, pages: number): Promise<CaseFileId> {
    const { caseFileId } = await caseFiles.startUpload(lawyer, { name: "Autos.pdf", bytes: pdf.length, pages });
    await files.putPart(await caseFiles.signUploadPart(lawyer, caseFileId, 1), pdf);
    await caseFiles.finishUpload(lawyer, caseFileId);
    return caseFileId;
  }

  return { ingestion, caseFiles, metering, files, jobs, upload };
}
