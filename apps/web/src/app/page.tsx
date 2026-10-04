import type { CaseFileStatus, CaseFileSummary } from "@consta/core";
import Link from "next/link";
import { DeleteCaseFile } from "@/components/delete-case-file";
import { isIngesting } from "@/components/ingestion-progress";
import { RefreshWhileIngesting } from "@/components/refresh-while-ingesting";
import { UploadCaseFile } from "@/components/upload-case-file";
import { formatNumber } from "@/lib/format";
import { container } from "@/server/container";
import { currentLawyer } from "@/server/lawyer";

export const dynamic = "force-dynamic";

const STATUS_BADGES: Record<CaseFileStatus, { label: string; className: string }> = {
  uploading: { label: "Enviando", className: "bg-zinc-100 text-zinc-700" },
  queued: { label: "Na fila", className: "bg-zinc-100 text-zinc-700" },
  processing: { label: "Lendo", className: "bg-blue-50 text-blue-900" },
  mapping: { label: "Montando o mapa", className: "bg-blue-50 text-blue-900" },
  ready: { label: "Pronto", className: "bg-emerald-50 text-emerald-800" },
  failed: { label: "Falhou", className: "bg-red-50 text-red-800" },
  deleting: { label: "Excluindo", className: "bg-zinc-100 text-zinc-500" },
};

const formatDate = (date: Date) => date.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

export default async function CaseFileListPage() {
  const caseFiles = await container().caseFiles.list(await currentLawyer());

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <RefreshWhileIngesting active={caseFiles.some((caseFile) => isIngesting(caseFile.status))} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Seus autos</h1>
          <p className="mt-1 text-sm text-zinc-600">Envie o PDF completo dos autos. Cada resposta traz a página que a sustenta.</p>
        </div>
        <UploadCaseFile />
      </div>

      {caseFiles.length === 0 ? (
        <p id="case-file-list-empty" className="mt-10 rounded-lg border border-dashed border-zinc-300 p-8 text-center text-zinc-600">
          Você ainda não enviou nenhum autos.
        </p>
      ) : (
        <ul id="case-file-list" className="mt-8 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
          {caseFiles.map((caseFile) => (
            <CaseFileRow key={caseFile.id} caseFile={caseFile} />
          ))}
        </ul>
      )}
    </main>
  );
}

function CaseFileRow({ caseFile }: { caseFile: CaseFileSummary }) {
  const badge = STATUS_BADGES[caseFile.status];
  return (
    <li id={`case-file-row-${caseFile.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
      <Link id={`open-case-file-${caseFile.id}`} href={`/autos/${caseFile.id}`} className="min-w-0 flex-1 truncate font-medium text-zinc-900 hover:text-blue-900 hover:underline">
        {caseFile.name}
      </Link>
      <span data-status={caseFile.status} className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
        {badge.label}
        {caseFile.status === "processing" && ` ${formatNumber(caseFile.pagesDone)} de ${formatNumber(caseFile.pageCount)}`}
      </span>
      <span className="w-24 text-right text-sm tabular-nums text-zinc-500">{formatNumber(caseFile.pageCount)} págs.</span>
      <span className="w-24 text-right text-sm tabular-nums text-zinc-500">{formatDate(caseFile.createdAt)}</span>
      <DeleteCaseFile caseFileId={caseFile.id} name={caseFile.name} />
    </li>
  );
}
