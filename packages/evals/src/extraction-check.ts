/**
 * Extraction check, the Phase 1 gate of prd-mvp.md. Ingests one real case file with the
 * production reader (pdf.js, ADR-0004), then writes a report of 20 random pages beside
 * the same pages of the PDF, for a person to check by eye, with the time and cost per
 * 1,000 pages. Nothing leaves this machine except the passages sent to Voyage.
 *
 *   pnpm --filter @consta/evals extraction-check <case-file.pdf> [out-dir]
 *
 * With VOYAGE_API_KEY set, passages are embedded by Voyage, which costs money. Without it,
 * the fake embedder runs: the time then leaves out the embedding calls, and the cost is 0.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CaseFileLifecycle, CaseFiles, Ingestion, LawyerId, MAX_PAGES, Metering } from "@consta/core";
import { FakeEmbedder, InMemoryFileStore, InMemoryUnitOfWork, RecordingJobs } from "@consta/core/fakes";
import type { InMemoryState } from "@consta/core/fakes";
import type { Embedder } from "@consta/core/ports";
import { VoyageEmbedder } from "@consta/adapters";
import { PDFDocument } from "pdf-lib";

const SAMPLE_PAGES = 20;

type Ingested = {
  name: string;
  pages: InMemoryState["ingestion"]["pages"];
  passages: InMemoryState["ingestion"]["passages"];
  costUsd: number;
  tokens: number;
  seconds: number;
};

/** Runs Ingestion through its interface, on the in-memory fakes, with the given embedder. */
class ExtractionCheck {
  constructor(private readonly embedder: Embedder) {}

  async run(name: string, pdf: Uint8Array): Promise<Ingested> {
    const uow = new InMemoryUnitOfWork();
    const files = new InMemoryFileStore();
    const metering = new Metering({ uow });
    const ingestion = new Ingestion({ uow, files, embedder: this.embedder, metering, lifecycle: new CaseFileLifecycle({ uow }) });
    const caseFiles = new CaseFiles({ uow, files, jobs: new RecordingJobs(), metering });
    const lawyer = LawyerId("extraction-check");
    // Any case file the pilot accepts, past the Trial quota.
    uow.state.metering.plans.set(lawyer, { plan: "enterprise", pageQuota: MAX_PAGES });

    // The upload recounts the pages, so the count given here only has to pass the quota.
    const { caseFileId } = await caseFiles.startUpload(lawyer, { name, bytes: pdf.length, pages: 1 });
    await files.putPart(await caseFiles.signUploadPart(lawyer, caseFileId, 1), pdf);
    await caseFiles.finishUpload(lawyer, caseFileId);
    const started = performance.now();
    await ingestion.ingestAll(caseFileId);
    const seconds = (performance.now() - started) / 1000;

    const { ingestion: stored, metering: metered } = uow.state;
    return {
      name,
      pages: stored.pages.sort((a, b) => a.number - b.number),
      passages: stored.passages,
      costUsd: metered.usage.reduce((total, event) => total + event.costUsd, 0),
      tokens: metered.usage.reduce((total, event) => total + event.units, 0),
      seconds,
    };
  }
}

/** The report: a summary, then each sampled page's text beside the same page of `pages.pdf`. */
class ExtractionReport {
  constructor(
    private readonly ingested: Ingested,
    private readonly sample: number[],
    private readonly embedderModel: string,
  ) {}

  html(): string {
    return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Extraction check: ${escape(this.ingested.name)}</title>
<style>
body { font: 14px/1.5 system-ui, sans-serif; margin: 24px; color: #1a1a1a; }
table.summary td { padding: 2px 16px 2px 0; }
section { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; border-top: 1px solid #ccc; padding: 16px 0; }
pre { white-space: pre-wrap; background: #f6f6f6; padding: 12px; margin: 0; max-height: 900px; overflow: auto; }
iframe { width: 100%; height: 900px; border: 1px solid #ccc; }
h2 { font-size: 16px; margin: 0 0 8px; }
</style></head><body>
<h1>Extraction check</h1>
${this.summary()}
<p>For each page: is every word of the PDF in the text, in reading order, with no words from another column or page? Tick the box when it is.</p>
${this.sample.map((number, index) => this.page(number, index + 1)).join("\n")}
</body></html>`;
  }

  private summary() {
    const { pages, passages, seconds, costUsd, tokens } = this.ingested;
    const scanned = pages.filter((page) => page.source === "scanned").length;
    const perThousand = (value: number) => (value * 1000) / pages.length;
    const rows: Array<[string, string]> = [
      ["Case file", this.ingested.name],
      ["Pages", `${pages.length} (${pages.length - scanned} digital, ${scanned} scanned and not read)`],
      ["Pages with a folha", String(pages.filter((page) => page.folha !== null).length)],
      ["Passages", String(passages.length)],
      ["Embedder", this.embedderModel],
      ["Time", `${seconds.toFixed(1)} s, ${perThousand(seconds).toFixed(1)} s per 1,000 pages`],
      ["Cost", `${costUsd.toFixed(4)} USD for ${tokens} tokens, ${perThousand(costUsd).toFixed(4)} USD per 1,000 pages`],
    ];
    return `<table class="summary">${rows.map(([label, value]) => `<tr><td>${label}</td><td>${escape(value)}</td></tr>`).join("")}</table>`;
  }

  private page(number: number, pdfPage: number) {
    const page = this.ingested.pages.find((stored) => stored.number === number)!;
    const passages = this.ingested.passages.filter((passage) => passage.page === number).length;
    const heading = `Page ${number}${page.folha ? `, fls. ${page.folha}` : ""}: ${page.source}, ${page.blocks.length} blocks, ${passages} passages`;
    return `<section><div><h2><label><input type="checkbox"> ${escape(heading)}</label></h2><pre>${escape(page.text || "(not read)")}</pre></div>
<iframe src="pages.pdf#page=${pdfPage}" title="Page ${number}"></iframe></section>`;
  }
}

/** Up to `count` distinct page numbers from 1 to `pages`, in order. */
function randomPages(pages: number, count: number) {
  const all = Array.from({ length: pages }, (_, i) => i + 1);
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j]!, all[i]!];
  }
  return all.slice(0, count).sort((a, b) => a - b);
}

/** The sampled pages as a small PDF, so the report shows them without the whole file. */
async function samplePdf(pdf: Uint8Array, sample: number[]) {
  const source = await PDFDocument.load(pdf, { ignoreEncryption: true });
  const out = await PDFDocument.create();
  for (const page of await out.copyPages(source, sample.map((number) => number - 1))) out.addPage(page);
  return out.save();
}

function escape(text: string) {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

async function main() {
  const [file, outArg] = process.argv.slice(2);
  if (!file) throw new Error("Usage: pnpm --filter @consta/evals extraction-check <case-file.pdf> [out-dir]");
  const apiKey = process.env.VOYAGE_API_KEY;
  const embedder = apiKey ? new VoyageEmbedder({ apiKey, model: "voyage-4-lite", dimensions: 1024 }) : new FakeEmbedder();
  const out = outArg ?? path.join("out", `extraction-check-${new Date().toISOString().replaceAll(":", "-")}`);

  const pdf = new Uint8Array(await readFile(file));
  const ingested = await new ExtractionCheck(embedder).run(path.basename(file), pdf);
  const sample = randomPages(ingested.pages.length, SAMPLE_PAGES);

  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, "pages.pdf"), await samplePdf(pdf, sample));
  await writeFile(path.join(out, "report.html"), new ExtractionReport(ingested, sample, embedder.model).html());
  console.info(`Wrote ${path.join(out, "report.html")}: ${ingested.pages.length} pages in ${ingested.seconds.toFixed(1)} s.`);
}

await main();
