import type { CaseFileSummary } from "@consta/core";
import { FileText } from "lucide-react";
import Link from "next/link";
import { DeleteCaseFile } from "@/components/delete-case-file";
import { RefreshWhileIngesting } from "@/components/refresh-while-ingesting";
import { StatusBadge } from "@/components/status-badge";
import { UploadCaseFile } from "@/components/upload-case-file";
import { formatNumber } from "@/lib/format";
import { container } from "@/server/container";
import { currentLawyer } from "@/server/lawyer";

export const dynamic = "force-dynamic";

const formatDate = (date: Date) =>
  date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Sao_Paulo" });

export default async function CaseFileListPage() {
  const caseFiles = await container().caseFiles.list(await currentLawyer());

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <RefreshWhileIngesting active={caseFiles.some((caseFile) => caseFile.ingesting)} />
      <div className="animate-rise">
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">Seus autos</h1>
        <p className="mt-2 max-w-xl text-muted">
          Envie o PDF completo do processo e pergunte o que precisar. Cada afirmação da resposta traz a página que a sustenta.
        </p>
      </div>

      <div className="mt-8">
        <UploadCaseFile />
      </div>

      <section className="mt-12" aria-labelledby="case-files-heading">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 id="case-files-heading" className="text-sm font-semibold text-foreground">
            Autos enviados
          </h2>
          <span className="text-xs tabular-nums text-subtle">{caseFiles.length}</span>
        </div>
        {caseFiles.length === 0 ? (
          <p id="case-file-list-empty" className="rounded-2xl border border-dashed border-line-strong p-10 text-center text-sm text-muted">
            Nenhum autos enviado ainda. Comece pelo PDF acima.
          </p>
        ) : (
          <ul id="case-file-list" className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            {caseFiles.map((caseFile) => (
              <CaseFileRow key={caseFile.id} caseFile={caseFile} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function CaseFileRow({ caseFile }: { caseFile: CaseFileSummary }) {
  return (
    <li id={`case-file-row-${caseFile.id}`} className="group relative flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-surface-muted/60 sm:px-5">
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">
        <FileText className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <Link
          id={`open-case-file-${caseFile.id}`}
          href={`/autos/${caseFile.id}`}
          className="block truncate font-medium text-foreground after:absolute after:inset-0 hover:text-accent-text"
        >
          {caseFile.name}
        </Link>
        <p className="mt-0.5 text-xs tabular-nums text-subtle">
          {formatNumber(caseFile.pageCount)} páginas · {formatDate(caseFile.createdAt)}
        </p>
      </div>
      <StatusBadge status={caseFile.status} pagesDone={caseFile.pagesDone} pageCount={caseFile.pageCount} />
      <div className="relative">
        <DeleteCaseFile caseFileId={caseFile.id} name={caseFile.name} />
      </div>
    </li>
  );
}
