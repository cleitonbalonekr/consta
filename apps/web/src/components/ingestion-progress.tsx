import type { CaseFileStatus } from "@consta/core";
import { Check, LoaderCircle, TriangleAlert } from "lucide-react";
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

/** The steps a lawyer watches, in order, each named for what it gives them. */
const STEPS: Array<{ status: CaseFileStatus; label: string }> = [
  { status: "uploading", label: "Envio do PDF" },
  { status: "queued", label: "Fila" },
  { status: "processing", label: "Leitura das páginas" },
  { status: "mapping", label: "Mapa dos autos" },
  { status: "ready", label: "Pronto para perguntas" },
];

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
      <div id="ingestion-failed" role="alert" className="animate-rise rounded-2xl border border-danger/30 bg-surface p-6 shadow-card">
        <span className="grid size-11 place-items-center rounded-xl bg-danger-soft text-danger">
          <TriangleAlert className="size-5" aria-hidden />
        </span>
        <p className="mt-4 text-lg font-semibold text-foreground">{STEP_LABELS.failed}</p>
        {error && <p className="mt-1 text-muted">{error}</p>}
        <p className="mt-4 text-sm text-subtle">Exclua estes autos e envie o arquivo de novo.</p>
      </div>
    );
  }

  const current = STEPS.findIndex((step) => step.status === status);
  const percent = pageCount ? Math.round((100 * pagesDone) / pageCount) : 0;

  return (
    <div id="ingestion-progress" className="animate-rise rounded-2xl border border-line bg-surface p-6 shadow-card">
      <p className="text-xs font-medium tracking-wide text-subtle uppercase">Preparando os autos</p>
      <p id="ingestion-status" data-status={status} className="mt-1 text-xl font-semibold tracking-tight text-foreground">
        {STEP_LABELS[status]}
      </p>
      <div
        role="progressbar"
        aria-label="Leitura dos autos"
        aria-valuemin={0}
        aria-valuemax={pageCount}
        aria-valuenow={pagesDone}
        className="mt-5 h-1.5 overflow-hidden rounded-full bg-surface-muted"
      >
        <div className="h-full rounded-full bg-gradient-to-r from-accent to-fuchsia-500 transition-all duration-500" style={{ width: `${percent}%` }} />
      </div>

      <ol className="mt-6 flex flex-col gap-4">
        {STEPS.map((step, index) => (
          <Step key={step.status} label={step.label} state={index < current ? "done" : index === current ? "current" : "pending"}>
            {step.status === "processing" && status === "processing" && (
              <span id="ingestion-pages" className="text-sm tabular-nums text-muted">
                {`${formatNumber(pagesDone)} de ${formatNumber(pageCount)} páginas lidas`}
              </span>
            )}
          </Step>
        ))}
      </ol>

      <p className="mt-6 border-t border-line pt-4 text-sm text-subtle">Você pode fechar esta página. A leitura continua sem você.</p>
    </div>
  );
}

type StepProps = { label: string; state: "done" | "current" | "pending"; children?: React.ReactNode };

function Step({ label, state, children }: StepProps) {
  return (
    <li className="flex items-start gap-3" aria-current={state === "current" ? "step" : undefined}>
      <span
        className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full ${
          state === "done" ? "bg-accent text-accent-foreground" : state === "current" ? "bg-accent-soft text-accent-text" : "border border-line-strong"
        }`}
      >
        {state === "done" && <Check className="size-3" strokeWidth={3} aria-hidden />}
        {state === "current" && <LoaderCircle className="size-3.5 animate-spin" aria-hidden />}
      </span>
      <span className="flex flex-col">
        <span className={`text-sm font-medium ${state === "pending" ? "text-subtle" : "text-foreground"}`}>{label}</span>
        {children}
      </span>
    </li>
  );
}
