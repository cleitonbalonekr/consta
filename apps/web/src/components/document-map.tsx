import type { PecaId, PecaType, PecaView } from "@consta/core";

const PECA_TYPE_LABELS: Record<PecaType, string> = {
  "peticao-inicial": "Petição inicial",
  contestacao: "Contestação",
  replica: "Réplica",
  despacho: "Despacho",
  decisao: "Decisão",
  sentenca: "Sentença",
  acordao: "Acórdão",
  recurso: "Recurso",
  laudo: "Laudo",
  "ata-de-audiencia": "Ata de audiência",
  procuracao: "Procuração",
  documento: "Documento",
  outro: "Outro",
};

// One color per family of peça: what the parties write, what the court decides, the evidence, the rest.
const PARTIES = "bg-accent-soft text-accent-text";
const COURT = "bg-warning-soft text-warning";
const EVIDENCE = "bg-success-soft text-success";
const OTHER = "bg-surface-muted text-muted";
const PECA_TYPE_TONES: Record<PecaType, string> = {
  "peticao-inicial": PARTIES,
  contestacao: PARTIES,
  replica: PARTIES,
  recurso: PARTIES,
  despacho: COURT,
  decisao: COURT,
  sentenca: COURT,
  acordao: COURT,
  laudo: EVIDENCE,
  "ata-de-audiencia": EVIDENCE,
  procuracao: OTHER,
  documento: OTHER,
  outro: OTHER,
};

/** "2026-02-09" as "09/02/2026", without passing through a time zone. */
function formatIsoDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

export function pageRange(peca: Pick<PecaView, "firstPage" | "lastPage">) {
  return peca.firstPage === peca.lastPage ? `p. ${peca.firstPage}` : `p. ${peca.firstPage}–${peca.lastPage}`;
}

type DocumentMapProps = {
  documentMap: PecaView[];
  selectedPecaId: PecaId | null;
  onSelect: (peca: PecaView) => void;
};

/** The peças of a case file in order, as a timeline. Choosing one scopes the next question to it. */
export function DocumentMap({ documentMap, selectedPecaId, onSelect }: DocumentMapProps) {
  return (
    <ol id="document-map" className="relative flex flex-col gap-1 before:absolute before:top-5 before:bottom-5 before:left-[0.9rem] before:w-px before:bg-line before:content-['']">
      {documentMap.map((peca) => {
        const selected = peca.id === selectedPecaId;
        return (
          <li key={peca.id} className="relative">
            <button
              id={`peca-row-${peca.id}`}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(peca)}
              className={`group flex w-full gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors ${
                selected ? "bg-accent-soft ring-1 ring-accent/40" : "hover:bg-surface-muted"
              }`}
            >
              <span
                className={`relative mt-1.5 size-2.5 shrink-0 rounded-full ring-4 ring-surface ${selected ? "bg-accent" : "bg-line-strong group-hover:bg-subtle"}`}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-2">
                  <span className={`rounded-md px-1.5 py-0.5 text-[0.65rem] font-semibold tracking-wide uppercase ${PECA_TYPE_TONES[peca.type]}`}>
                    {PECA_TYPE_LABELS[peca.type]}
                  </span>
                  <span className="shrink-0 font-mono text-[0.7rem] tabular-nums text-subtle">{pageRange(peca)}</span>
                </span>
                <span className="mt-1.5 block text-sm font-medium text-foreground">{peca.title}</span>
                {peca.date && <span className="block text-xs tabular-nums text-subtle">{formatIsoDate(peca.date)}</span>}
                <span className={`mt-1 block text-[0.8rem] leading-snug text-muted ${selected ? "" : "line-clamp-2"}`}>{peca.summary}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
