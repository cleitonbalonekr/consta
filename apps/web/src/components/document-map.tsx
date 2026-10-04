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

/** The peças of a case file in order. Choosing one scopes the next question to it. */
export function DocumentMap({ documentMap, selectedPecaId, onSelect }: DocumentMapProps) {
  return (
    <ol id="document-map" className="flex flex-col gap-1">
      {documentMap.map((peca) => {
        const selected = peca.id === selectedPecaId;
        return (
          <li key={peca.id}>
            <button
              id={`peca-row-${peca.id}`}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(peca)}
              className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                selected ? "border-blue-800 bg-blue-50" : "border-transparent hover:border-zinc-200 hover:bg-white"
              }`}
            >
              <span className="flex items-baseline justify-between gap-2 text-xs text-zinc-500">
                <span className="font-medium uppercase tracking-wide">{PECA_TYPE_LABELS[peca.type]}</span>
                <span className="shrink-0 tabular-nums">{pageRange(peca)}</span>
              </span>
              <span className="mt-0.5 block font-medium text-zinc-900">{peca.title}</span>
              {peca.date && <span className="block text-xs tabular-nums text-zinc-500">{formatIsoDate(peca.date)}</span>}
              <span className="mt-1 block text-sm leading-snug text-zinc-600">{peca.summary}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
