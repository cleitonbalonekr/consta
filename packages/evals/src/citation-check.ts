/**
 * Citation check, the Phase 2 gate of prd-mvp.md: 18 of 20 real questions must cite the
 * right page. Ingests one real case file and asks each pilot question about the whole case
 * file with the production adapters (Voyage, Claude) and the production hybrid search SQL on
 * an in-memory Postgres (PGlite). Writes a report of every answer with its cited pages and
 * quotes beside the expected pages, for a person to check each citation against the PDF.
 *
 *   pnpm --filter @consta/evals citation-check <case-file.pdf> <questions.json> [out-dir]
 *
 * questions.json holds the 20 pilot questions: [{ "question": "...", "pages": [12, 13] }],
 * where `pages` are the pages a lawyer expects the answer to cite. Needs VOYAGE_API_KEY and
 * ANTHROPIC_API_KEY, and costs money: the passages go to Voyage, the questions to both.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Answering, CaseFileLifecycle, CaseFiles, Ingestion, MAX_PAGES, Metering } from "@consta/core";
import type { CaseFileId, LawyerId, Statement } from "@consta/core";
import { DrizzleUnitOfWork, schema } from "@consta/core/db";
import { InMemoryFileStore, RecordingJobs } from "@consta/core/fakes";
import { createTestDb, insertLawyer } from "@consta/core/testing";
import { ClaudeCitingModel, VoyageEmbedder, VoyageReranker } from "@consta/adapters";

type PilotQuestion = { question: string; pages: number[] };

type Answered = PilotQuestion & { statements: Statement[]; dropped: number; seconds: number };

/** Ingests the case file once, then asks every question through Answering's interface. */
class CitationCheck {
  private readonly uow: DrizzleUnitOfWork;
  private readonly metering: Metering;

  private constructor(
    private readonly db: Awaited<ReturnType<typeof createTestDb>>,
    private readonly keys: { voyage: string; anthropic: string },
  ) {
    this.uow = new DrizzleUnitOfWork(db);
    this.metering = new Metering({ uow: this.uow });
  }

  static async start(keys: { voyage: string; anthropic: string }) {
    return new CitationCheck(await createTestDb(), keys);
  }

  async run(name: string, pdf: Uint8Array, questions: PilotQuestion[]): Promise<{ answers: Answered[]; costUsd: number }> {
    const embedder = new VoyageEmbedder({ apiKey: this.keys.voyage, model: "voyage-4-lite", dimensions: 1024 });
    const lawyer = await insertLawyer(this.db);
    // Any case file the pilot accepts, past the Trial quota.
    await this.uow.run((repos) => repos.metering.insertPlanIfMissing(lawyer, { plan: "enterprise", pageQuota: MAX_PAGES }));
    const caseFileId = await this.ingest(lawyer, embedder, name, pdf);

    const answering = new Answering({
      uow: this.uow,
      embedder,
      reranker: new VoyageReranker({ apiKey: this.keys.voyage, model: "rerank-3-lite" }),
      model: new ClaudeCitingModel({ apiKey: this.keys.anthropic, model: "claude-sonnet-5-5" }),
      metering: this.metering,
    });
    const answers: Answered[] = [];
    for (const pilot of questions) answers.push(await this.ask(answering, lawyer, caseFileId, pilot));
    return { answers, costUsd: await this.costUsd() };
  }

  private async ingest(lawyer: LawyerId, embedder: VoyageEmbedder, name: string, pdf: Uint8Array) {
    const files = new InMemoryFileStore();
    const caseFiles = new CaseFiles({ uow: this.uow, files, jobs: new RecordingJobs(), metering: this.metering });
    const ingestion = new Ingestion({ uow: this.uow, files, embedder, metering: this.metering, lifecycle: new CaseFileLifecycle({ uow: this.uow, metering: this.metering }) });
    // The upload recounts the pages, so the count given here only has to pass the quota.
    const { caseFileId } = await caseFiles.startUpload(lawyer, { name, bytes: pdf.length, pages: 1 });
    await files.putPart(await caseFiles.signUploadPart(lawyer, caseFileId, 1), pdf);
    await caseFiles.finishUpload(lawyer, caseFileId);
    await ingestion.ingest(caseFileId);
    return caseFileId;
  }

  private async ask(answering: Answering, lawyer: LawyerId, caseFileId: CaseFileId, pilot: PilotQuestion): Promise<Answered> {
    const started = performance.now();
    const statements: Statement[] = [];
    let dropped = 0;
    for await (const event of answering.ask(lawyer, { caseFileId, scope: { kind: "whole-file" }, text: pilot.question })) {
      if (event.type === "statement") statements.push(event.statement);
      if (event.type === "done") dropped = event.dropped;
      if (event.type === "refused") throw new Error(`The case file was not ready: ${event.reason}.`);
    }
    return { ...pilot, statements, dropped, seconds: (performance.now() - started) / 1000 };
  }

  private async costUsd() {
    const rows = await this.db.select({ costUsd: schema.usageEvent.costUsd }).from(schema.usageEvent);
    return rows.reduce((total, row) => total + Number(row.costUsd), 0);
  }
}

/** The report: a summary, then each question with its statements and their cited pages. */
class CitationReport {
  constructor(
    private readonly name: string,
    private readonly answers: Answered[],
    private readonly costUsd: number,
  ) {}

  html(): string {
    return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Citation check: ${escape(this.name)}</title>
<style>
body { font: 14px/1.5 system-ui, sans-serif; margin: 24px; color: #1a1a1a; max-width: 960px; }
table.summary td { padding: 2px 16px 2px 0; }
section { border-top: 1px solid #ccc; padding: 16px 0; }
h2 { font-size: 16px; margin: 0 0 8px; }
blockquote { margin: 4px 0 8px 16px; color: #555; white-space: pre-wrap; font-size: 12px; }
.hint { color: #555; font-size: 12px; }
</style></head><body>
<h1>Citation check</h1>
${this.summary()}
<p>For each question: open every cited page in the PDF. Tick the box when the cited pages hold what the statements say. The gate is 18 of 20.</p>
${this.answers.map((answer, index) => this.answer(answer, index + 1)).join("\n")}
</body></html>`;
  }

  private summary() {
    const hits = this.answers.filter((answer) => citedPages(answer).some((page) => answer.pages.includes(page))).length;
    const seconds = this.answers.map((answer) => answer.seconds).sort((a, b) => a - b);
    const rows: Array<[string, string]> = [
      ["Case file", this.name],
      ["Questions", String(this.answers.length)],
      ["Answers citing an expected page (a hint, not the gate)", `${hits} of ${this.answers.length}`],
      ["Statements dropped for no citation", String(this.answers.reduce((total, answer) => total + answer.dropped, 0))],
      ["Median time per answer", `${(seconds[Math.floor(seconds.length / 2)] ?? 0).toFixed(1)} s`],
      ["Cost, ingestion included", `${this.costUsd.toFixed(4)} USD`],
    ];
    return `<table class="summary">${rows.map(([label, value]) => `<tr><td>${escape(label)}</td><td>${escape(value)}</td></tr>`).join("")}</table>`;
  }

  private answer(answer: Answered, number: number) {
    const cited = citedPages(answer);
    const statements = answer.statements.map((statement) => {
      const citations = statement.citations
        .map((citation) => `<li>${escape(label(citation))}<blockquote>${escape(citation.quote)}</blockquote></li>`)
        .join("");
      return `<li>${escape(statement.text)}<ul>${citations}</ul></li>`;
    });
    return `<section><h2><label><input type="checkbox"> ${number}. ${escape(answer.question)}</label></h2>
<p class="hint">Expected pages: ${answer.pages.join(", ") || "none given"}. Cited pages: ${cited.join(", ") || "none"}. Dropped: ${answer.dropped}.</p>
<ol>${statements.join("\n") || "<li>(no statement)</li>"}</ol></section>`;
  }
}

function citedPages(answer: Answered) {
  return [...new Set(answer.statements.flatMap((statement) => statement.citations.map((citation) => citation.page)))].sort((a, b) => a - b);
}

function label(citation: Statement["citations"][number]) {
  return citation.folha ? `p. ${citation.page} · fls. ${citation.folha}` : `p. ${citation.page}`;
}

function escape(text: string) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}: the citation check runs with the real adapters only.`);
  return value;
}

/** Checks the shape of questions.json, which a person writes by hand. */
function parseQuestions(json: unknown): PilotQuestion[] {
  const valid = (item: unknown): item is PilotQuestion =>
    typeof item === "object" &&
    item !== null &&
    typeof (item as PilotQuestion).question === "string" &&
    Array.isArray((item as PilotQuestion).pages) &&
    (item as PilotQuestion).pages.every((page) => Number.isInteger(page));
  if (!Array.isArray(json) || !json.every(valid)) throw new Error('questions.json must be a list of { "question": string, "pages": number[] }.');
  return json;
}

async function main() {
  const [file, questionsFile, outArg] = process.argv.slice(2);
  if (!file || !questionsFile) throw new Error("Usage: pnpm --filter @consta/evals citation-check <case-file.pdf> <questions.json> [out-dir]");
  const keys = { voyage: required("VOYAGE_API_KEY"), anthropic: required("ANTHROPIC_API_KEY") };
  const questions = parseQuestions(JSON.parse(await readFile(questionsFile, "utf8")));
  const out = outArg ?? path.join("out", `citation-check-${new Date().toISOString().replaceAll(":", "-")}`);

  const pdf = new Uint8Array(await readFile(file));
  const check = await CitationCheck.start(keys);
  const { answers, costUsd } = await check.run(path.basename(file), pdf, questions);

  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, "report.html"), new CitationReport(path.basename(file), answers, costUsd).html());
  console.info(`Wrote ${path.join(out, "report.html")}: ${answers.length} questions, ${costUsd.toFixed(4)} USD.`);
}

await main();
