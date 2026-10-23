import { Month } from "@consta/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { CostReportTable } from "@/components/cost-report";
import { container } from "@/server/container";
import { currentOperator } from "@/server/lawyer";

export const dynamic = "force-dynamic";

const formatMonth = (month: Month) =>
  month.start.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });

/** What paid providers cost per lawyer and per case file, for one month (`?mes=YYYY-MM`, this month by default). */
export default async function OperatorCostsPage(props: PageProps<"/operador/custos">) {
  await currentOperator();
  const { mes } = await props.searchParams;
  const month = (typeof mes === "string" && Month.parse(mes)) || Month.of(new Date());
  const report = await container().metering.costs(month);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground">Custos</h1>
          <p className="mt-2 text-muted">O que os provedores pagos custaram, por advogado e por autos, a partir de usage_event.</p>
        </div>
        <nav aria-label="Mês" className="flex items-center gap-1">
          <MonthLink id="costs-previous-month" month={month.previous()} label="Mês anterior">
            <ChevronLeft className="size-4" aria-hidden />
          </MonthLink>
          <span id="costs-month" className="min-w-36 text-center text-sm font-medium capitalize text-foreground">
            {formatMonth(month)}
          </span>
          <MonthLink id="costs-next-month" month={month.next()} label="Próximo mês">
            <ChevronRight className="size-4" aria-hidden />
          </MonthLink>
        </nav>
      </div>
      <div className="mt-8">
        <CostReportTable report={report} />
      </div>
    </main>
  );
}

function MonthLink({ id, month, label, children }: { id: string; month: Month; label: string; children: React.ReactNode }) {
  return (
    <Link
      id={id}
      href={`/operador/custos?mes=${month.toString()}`}
      aria-label={label}
      className="grid size-8 place-items-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
    >
      {children}
    </Link>
  );
}
