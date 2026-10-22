/**
 * Document map check, the Phase 3 gate of prd-mvp.md: the map of one real case file must
 * find 90% or more of the peças in the lawyer's own index, with the correct type and page
 * range. Ingests the case file with the production reader and the Claude map extractor, then
 * writes a report of every peça of the index beside the peça the map found for it.
 *
 *   pnpm --filter @consta/evals map-check <case-file.pdf> <index.json> [out-dir]
 *
 * index.json is the lawyer's index: [{ "type": "sentenca", "firstPage": 9, "lastPage": 10, "title": "..." }],
 * with a type from the peça types in CONTEXT.md and an optional title. Needs ANTHROPIC_API_KEY
 * and costs money: the pages go to Claude. MAP_MODEL picks the model, Claude Haiku 5.5 by
 * default; if Haiku fails the gate, run it again with MAP_MODEL=claude-sonnet-5-5 and record
 * both results in the ticket.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CaseFiles, Ingestion, LawyerId, MAX_PAGES, Metering, pecaTypes } from "@consta/core";
import type { PecaType, PecaView } from "@consta/core";
import { FakeEmbedder, InMemoryFileStore, InMemoryUnitOfWork, RecordingJobs } from "@consta/core/fakes";
import { ClaudeMapExtractor } from "@consta/adapters";
import { escape } from "./html";

/** The PRD's document map accuracy target. */
const GATE = 0.9;

type IndexedPeca = { type: PecaType; firstPage: number; lastPage: number; title?: string };

type Mapped = { documentMap: PecaView[]; costUsd: number; seconds: number };

type Verdict = "found" | "wrong type" | "wrong pages" | "missing";

/** Runs Ingestion through its interface, on the in-memory fakes, with the Claude map extractor. */
class MapCheck {
  constructor(private readonly extractor: ClaudeMapExtractor) {}

  async run(name: string, pdf: Uint8Array): Promise<Mapped> {
    const uow = new InMemoryUnitOfWork();
    const files = new InMemoryFileStore();
    const metering = new Metering({ uow });
    // The map needs no embeddings, so the free fake embeds the passages.
    const ingestion = new Ingestion({ uow, files, embedder: new FakeEmbedder(), mapExtractor: this.extractor, metering });
    const caseFiles = new CaseFiles({ uow, files, jobs: new RecordingJobs(), metering });
    const lawyer = LawyerId("map-check");
    // Any case file the pilot accepts, past the Trial quota.
    uow.state.metering.plans.set(lawyer, { plan: "enterprise", pageQuota: MAX_PAGES });

    // The upload recounts the pages, so the count given here only has to pass the quota.
    const { caseFileId } = await caseFiles.startUpload(lawyer, { name, bytes: pdf.length, pages: 1 });
    await files.putPart(await caseFiles.signUploadPart(lawyer, caseFileId, 1), pdf);
    await caseFiles.finishUpload(lawyer, caseFileId);
    const started = performance.now();
    await ingestion.ingest(caseFileId);
    const seconds = (performance.now() - started) / 1000;

    const view = await caseFiles.view(lawyer, caseFileId);
    if (view.status !== "ready") throw new Error(`Ingestion ended ${view.status}: ${view.error}`);
    const costUsd = uow.state.metering.usage.reduce((total, event) => total + event.costUsd, 0);
    return { documentMap: view.documentMap, costUsd, seconds };
  }
}

/** Each peça of the lawyer's index beside the peça of the map that starts on the same page. */
class MapComparison {
  readonly rows: { indexed: IndexedPeca; mapped: PecaView | null; verdict: Verdict }[];
  /** Peças of the map that start on no page where the index starts one. */
  readonly extra: PecaView[];

  constructor(index: IndexedPeca[], documentMap: PecaView[]) {
    this.rows = index.map((indexed) => {
      const mapped = documentMap.find((peca) => peca.firstPage === indexed.firstPage) ?? null;
      return { indexed, mapped, verdict: MapComparison.verdict(indexed, mapped) };
    });
    this.extra = documentMap.filter((peca) => !index.some((indexed) => indexed.firstPage === peca.firstPage));
  }

  get found(): number {
    return this.rows.filter((row) => row.verdict === "found").length;
  }

  get passes(): boolean {
    return this.rows.length > 0 && this.found / this.rows.length >= GATE;
  }

  private static verdict(indexed: IndexedPeca, mapped: PecaView | null): Verdict {
    if (!mapped) return "missing";
    if (mapped.lastPage !== indexed.lastPage) return "wrong pages";
    return mapped.type === indexed.type ? "found" : "wrong type";
  }
}

/** The report: the summary and the gate, then the index row by row, then the peças the index lacks. */
class MapReport {
  constructor(
    private readonly name: string,
    private readonly model: string,
    private readonly comparison: MapComparison,
    private readonly mapped: Mapped,
  ) {}

  html(): string {
    const { rows, extra } = this.comparison;
    return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Document map check: ${escape(this.name)}</title>
<style>
body { font: 14px/1.5 system-ui, sans-serif; margin: 24px; color: #1a1a1a; max-width: 1100px; }
table { border-collapse: collapse; width: 100%; }
td, th { border-bottom: 1px solid #ddd; padding: 4px 8px; text-align: left; vertical-align: top; }
table.summary td { border: 0; padding: 2px 16px 2px 0; }
.found { color: #1a7f37; } .missing, .wrong { color: #b42318; }
</style></head><body>
<h1>Document map check</h1>
${this.summary()}
<h2>The lawyer's index</h2>
<table><tr><th>Index</th><th>Map</th><th>Verdict</th></tr>
${rows.map((row) => `<tr><td>${indexed(row.indexed)}</td><td>${row.mapped ? mapped(row.mapped) : "—"}</td><td class="${row.verdict === "found" ? "found" : row.verdict === "missing" ? "missing" : "wrong"}">${row.verdict}</td></tr>`).join("\n")}
</table>
<h2>Peças the index does not have (${extra.length})</h2>
<table>${extra.map((peca) => `<tr><td>${mapped(peca)}</td></tr>`).join("\n") || "<tr><td>None.</td></tr>"}</table>
</body></html>`;
  }

  private summary() {
    const { found, rows, passes } = this.comparison;
    const share = rows.length > 0 ? (100 * found) / rows.length : 0;
    const summary: Array<[string, string]> = [
      ["Case file", this.name],
      ["Model", this.model],
      ["Peças found with the right type and pages", `${found} of ${rows.length} (${share.toFixed(0)}%)`],
      ["Gate (90% or more)", passes ? "passes" : "fails"],
      ["Peças in the map", String(this.mapped.documentMap.length)],
      ["Time", `${this.mapped.seconds.toFixed(0)} s`],
      ["Cost", `${this.mapped.costUsd.toFixed(4)} USD`],
    ];
    return `<table class="summary">${summary.map(([label, value]) => `<tr><td>${escape(label)}</td><td>${escape(value)}</td></tr>`).join("")}</table>`;
  }
}

function indexed(peca: IndexedPeca) {
  return `${escape(peca.type)}, ${pages(peca)}${peca.title ? `<br>${escape(peca.title)}` : ""}`;
}

function mapped(peca: PecaView) {
  return `${escape(peca.type)}, ${pages(peca)}${peca.date ? `, ${peca.date}` : ""}<br><b>${escape(peca.title)}</b><br>${escape(peca.summary)}`;
}

function pages({ firstPage, lastPage }: { firstPage: number; lastPage: number }) {
  return firstPage === lastPage ? `p. ${firstPage}` : `p. ${firstPage}–${lastPage}`;
}

/** Checks the shape of index.json, which a person writes by hand. */
function parseIndex(json: unknown): IndexedPeca[] {
  const valid = (item: unknown): item is IndexedPeca => {
    const peca = item as IndexedPeca;
    return (
      typeof item === "object" &&
      item !== null &&
      pecaTypes.includes(peca.type) &&
      Number.isInteger(peca.firstPage) &&
      Number.isInteger(peca.lastPage) &&
      peca.firstPage <= peca.lastPage &&
      (peca.title === undefined || typeof peca.title === "string")
    );
  };
  if (!Array.isArray(json) || !json.every(valid)) {
    throw new Error(`index.json must be a list of { "type": one of ${pecaTypes.join(", ")}, "firstPage": number, "lastPage": number, "title"?: string }.`);
  }
  return json;
}

async function main() {
  const [file, indexFile, outArg] = process.argv.slice(2);
  if (!file || !indexFile) throw new Error("Usage: pnpm --filter @consta/evals map-check <case-file.pdf> <index.json> [out-dir]");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing environment variable ANTHROPIC_API_KEY: the map check runs with the real map extractor only.");
  const model = process.env.MAP_MODEL || "claude-haiku-5-5";
  const index = parseIndex(JSON.parse(await readFile(indexFile, "utf8")));
  const out = outArg ?? path.join("out", `map-check-${new Date().toISOString().replaceAll(":", "-")}`);

  const pdf = new Uint8Array(await readFile(file));
  const result = await new MapCheck(new ClaudeMapExtractor({ apiKey, model })).run(path.basename(file), pdf);
  const comparison = new MapComparison(index, result.documentMap);

  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, "report.html"), new MapReport(path.basename(file), model, comparison, result).html());
  const verdict = comparison.passes ? "passes" : "fails";
  console.info(`Wrote ${path.join(out, "report.html")}: ${comparison.found} of ${comparison.rows.length} peças found, the gate ${verdict}, ${result.costUsd.toFixed(4)} USD.`);
}

await main();
