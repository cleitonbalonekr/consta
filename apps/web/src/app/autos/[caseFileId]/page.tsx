import { CaseFileId, NotFound } from "@consta/core";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CaseFileWorkspace } from "@/components/case-file-workspace";
import { DeleteCaseFile } from "@/components/delete-case-file";
import { IngestionProgress } from "@/components/ingestion-progress";
import { RefreshWhileIngesting } from "@/components/refresh-while-ingesting";
import { StatusBadge } from "@/components/status-badge";
import { UnreadPages } from "@/components/unread-pages";
import { formatNumber } from "@/lib/format";
import { container } from "@/server/container";
import { currentLawyer } from "@/server/lawyer";

export const dynamic = "force-dynamic";

export default async function CaseFilePage(props: PageProps<"/autos/[caseFileId]">) {
  const lawyer = await currentLawyer();
  const caseFileId = CaseFileId((await props.params).caseFileId);
  const { caseFiles } = container();
  const caseFile = await caseFiles.view(lawyer, caseFileId).catch((error: unknown) => {
    if (error instanceof NotFound) notFound();
    throw error;
  });
  const ready = caseFile.status === "ready";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-line bg-surface/60 px-4 py-2.5 sm:px-6">
        <Link
          id="back-to-list"
          href="/"
          aria-label="Voltar para seus autos"
          title="Seus autos"
          className="grid size-8 shrink-0 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 id="case-file-name" className="truncate text-sm font-semibold text-foreground">
            {caseFile.name}
          </h1>
          <p className="text-xs tabular-nums text-subtle">{formatNumber(caseFile.pageCount)} páginas</p>
        </div>
        <StatusBadge id="case-file-status" status={caseFile.status} pagesDone={caseFile.pagesDone} pageCount={caseFile.pageCount} />
        <DeleteCaseFile caseFileId={caseFile.id} name={caseFile.name} returnToList />
      </div>
      {ready && <UnreadPages ranges={caseFile.unreadPages} />}
      {ready ? (
        <CaseFileWorkspace
          caseFileId={caseFile.id}
          documentMap={caseFile.documentMap}
          folhas={caseFile.folhas}
          pdfUrl={await caseFiles.readUrl(lawyer, caseFileId)}
        />
      ) : (
        <main className="mx-auto w-full max-w-lg px-4 py-12">
          <RefreshWhileIngesting active={caseFile.ingesting} />
          <IngestionProgress status={caseFile.status} pagesDone={caseFile.pagesDone} pageCount={caseFile.pageCount} error={caseFile.error} />
        </main>
      )}
    </div>
  );
}
