import type { CostReport, CostsByKind, UsageKind } from "@consta/core";
import { usageKinds } from "@consta/core";
import { formatUsd } from "@/lib/format";

const KIND_LABELS: Record<UsageKind, string> = {
  ocr: "OCR",
  embed: "Embeddings",
  rerank: "Reranking",
  extract: "Extração",
  answer: "Respostas",
};

/** The operator's costs for one month: a row per lawyer, then a row per case file of theirs. */
export function CostReportTable({ report }: { report: CostReport }) {
  if (report.lawyers.length === 0) {
    return (
      <p id="costs-empty" className="rounded-2xl border border-dashed border-line-strong p-10 text-center text-sm text-muted">
        Nenhum custo registrado neste mês.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
      <table id="costs-report" className="w-full text-sm">
        <thead className="border-b border-line text-left text-xs text-subtle">
          <tr>
            <th className="px-4 py-2.5 font-medium">Advogado e autos</th>
            {usageKinds.map((kind) => (
              <th key={kind} className="px-4 py-2.5 text-right font-medium">
                {KIND_LABELS[kind]}
              </th>
            ))}
            <th className="px-4 py-2.5 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {report.lawyers.flatMap(({ lawyer, email, costs, caseFiles }) => [
            <CostRow key={lawyer} id={`costs-lawyer-${lawyer}`} label={email} costs={costs} strong />,
            ...caseFiles.map(({ caseFileId, name, costs }) => (
              <CostRow
                key={`${lawyer}-${caseFileId ?? "none"}`}
                id={`costs-case-file-${lawyer}-${caseFileId ?? "none"}`}
                label={name ?? "Sem autos (excluídos ou sem vínculo)"}
                costs={costs}
                indent
              />
            )),
          ])}
        </tbody>
        <tfoot className="border-t border-line-strong">
          <CostRow id="costs-total" label="Total do mês" costs={report.total} strong />
        </tfoot>
      </table>
    </div>
  );
}

function CostRow({ id, label, costs, strong, indent }: { id: string; label: string; costs: CostsByKind; strong?: boolean; indent?: boolean }) {
  return (
    <tr id={id} className={strong ? "font-semibold text-foreground" : "text-muted"}>
      <td className={`max-w-xs truncate py-2.5 pr-4 ${indent ? "pl-8" : "pl-4"}`}>{label}</td>
      {usageKinds.map((kind) => (
        <td key={kind} className="px-4 py-2.5 text-right tabular-nums">
          {formatUsd(costs[kind])}
        </td>
      ))}
      <td className="px-4 py-2.5 text-right tabular-nums">{formatUsd(costs.total)}</td>
    </tr>
  );
}
