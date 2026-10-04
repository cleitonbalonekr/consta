import type { CaseFileStatus } from "@consta/core";
import { formatNumber } from "@/lib/format";

const BADGES: Record<CaseFileStatus, { label: string; tone: string; pulse: boolean }> = {
  uploading: { label: "Enviando", tone: "bg-surface-muted text-muted", pulse: true },
  queued: { label: "Na fila", tone: "bg-surface-muted text-muted", pulse: true },
  processing: { label: "Lendo", tone: "bg-accent-soft text-accent-text", pulse: true },
  mapping: { label: "Montando o mapa", tone: "bg-accent-soft text-accent-text", pulse: true },
  ready: { label: "Pronto", tone: "bg-success-soft text-success", pulse: false },
  failed: { label: "Falhou", tone: "bg-danger-soft text-danger", pulse: false },
  deleting: { label: "Excluindo", tone: "bg-surface-muted text-subtle", pulse: true },
};

type StatusBadgeProps = { status: CaseFileStatus; pagesDone: number; pageCount: number };

/** A case file's status in a word, with pages read while they are being read. */
export function StatusBadge({ status, pagesDone, pageCount }: StatusBadgeProps) {
  const badge = BADGES[status];
  return (
    <span data-status={status} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${badge.tone}`}>
      <span className="relative flex size-1.5">
        {badge.pulse && <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />}
        <span className="relative inline-flex size-1.5 rounded-full bg-current" />
      </span>
      {badge.label}
      {status === "processing" && <span className="tabular-nums">{` ${formatNumber(pagesDone)} de ${formatNumber(pageCount)}`}</span>}
    </span>
  );
}
