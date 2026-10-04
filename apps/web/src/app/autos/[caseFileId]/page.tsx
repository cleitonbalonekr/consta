import { CaseFileId, NotFound } from "@consta/core";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CaseFileWorkspace } from "@/components/case-file-workspace";
import { DeleteCaseFile } from "@/components/delete-case-file";
import { IngestionProgress, isIngesting } from "@/components/ingestion-progress";
import { RefreshWhileIngesting } from "@/components/refresh-while-ingesting";
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
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-zinc-200 bg-white px-4 py-3 sm:px-6">
        <Link id="back-to-list" href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
          ← Seus autos
        </Link>
        <h1 id="case-file-name" className="min-w-0 flex-1 truncate font-semibold text-zinc-900">
          {caseFile.name}
        </h1>
        <span className="text-sm tabular-nums text-zinc-500">{formatNumber(caseFile.pageCount)} páginas</span>
        <DeleteCaseFile caseFileId={caseFile.id} name={caseFile.name} returnToList />
      </div>
      {ready ? (
        <CaseFileWorkspace caseFileId={caseFile.id} documentMap={caseFile.documentMap} pdfUrl={await caseFiles.readUrl(lawyer, caseFileId)} />
      ) : (
        <main className="mx-auto w-full max-w-xl px-4 py-10">
          <RefreshWhileIngesting active={isIngesting(caseFile.status)} />
          <IngestionProgress status={caseFile.status} pagesDone={caseFile.pagesDone} pageCount={caseFile.pageCount} error={caseFile.error} />
        </main>
      )}
    </div>
  );
}
