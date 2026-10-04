import type { CaseFileStatus } from "@consta/core";
import { formatNumber } from "@/lib/format";

const STEP_LABELS: Record<CaseFileStatus, string> = {
  uploading: "Enviando o arquivo",
  queued: "Na fila para leitura",
  processing: "Lendo as páginas",
  mapping: "Montando o mapa dos autos",
  ready: "Pronto",
  failed: "Não foi possível ler estes autos",
  deleting: "Excluindo",
};

const INGESTING: CaseFileStatus[] = ["uploading", "queued", "processing", "mapping"];

/** Whether the case file is still on its way to ready or failed. */
export function isIngesting(status: CaseFileStatus) {
  return INGESTING.includes(status);
}

type IngestionProgressProps = {
  status: CaseFileStatus;
  pagesDone: number;
  pageCount: number;
  error: string | null;
};

/** Where ingestion of a case file is, with "N de M páginas lidas" while pages are read. */
export function IngestionProgress({ status, pagesDone, pageCount, error }: IngestionProgressProps) {
  if (status === "failed") {
    return (
      <div id="ingestion-failed" role="alert" className="rounded-lg border border-red-200 bg-red-50 p-5">
        <p className="font-semibold text-red-900">{STEP_LABELS.failed}</p>
        {error && <p className="mt-1 text-red-800">{error}</p>}
        <p className="mt-3 text-sm text-red-800">Exclua estes autos e envie o arquivo de novo.</p>
      </div>
    );
  }

  return (
    <div id="ingestion-progress" className="rounded-lg border border-zinc-200 bg-white p-5">
      <p id="ingestion-status" data-status={status} className="font-semibold text-zinc-900">
        {STEP_LABELS[status]}
      </p>
      <div
        role="progressbar"
        aria-label="Leitura dos autos"
        aria-valuemin={0}
        aria-valuemax={pageCount}
        aria-valuenow={pagesDone}
        className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-100"
      >
        <div className="h-full bg-blue-800 transition-all" style={{ width: `${pageCount ? (100 * pagesDone) / pageCount : 0}%` }} />
      </div>
      {status === "processing" && (
        <p id="ingestion-pages" className="mt-2 text-sm tabular-nums text-zinc-600">
          {formatNumber(pagesDone)} de {formatNumber(pageCount)} páginas lidas
        </p>
      )}
      <p className="mt-3 text-sm text-zinc-500">Você pode fechar esta página. A leitura continua sem você.</p>
    </div>
  );
}
