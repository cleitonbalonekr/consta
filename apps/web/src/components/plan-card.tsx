import type { Plan, PlanView } from "@consta/core";
import { manageBilling, upgradeToPro } from "@/app/actions";
import { formatNumber } from "@/lib/format";

const PLAN_NAMES: Record<Plan, string> = { trial: "Trial", pro: "Pro", enterprise: "Enterprise" };

const BUTTON = "inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-90";

/** The lawyer's plan and page quota; Trial offers Pro, and a lawyer who has paid manages billing in Stripe. */
export function PlanCard({ plan }: { plan: PlanView }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-6 shadow-card">
      <p className="text-sm text-muted">Seu plano</p>
      <p id="plan-name" className="mt-1 text-2xl font-semibold text-foreground">
        {PLAN_NAMES[plan.plan]}
      </p>
      <p id="plan-pages-left" className="mt-2 text-sm tabular-nums text-muted">
        {`${formatNumber(Math.max(0, plan.pagesLeft))} de ${formatNumber(plan.pageQuota)} páginas restantes neste mês`}
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        {plan.pro && (
          <form action={upgradeToPro}>
            <button id="plan-upgrade-to-pro" type="submit" className={`${BUTTON} bg-foreground text-background`}>
              Assinar o Pro
            </button>
          </form>
        )}
        {plan.managesBilling && (
          <form action={manageBilling}>
            <button id="manage-billing" type="submit" className={`${BUTTON} border border-line-strong text-foreground`}>
              Gerenciar cobrança
            </button>
          </form>
        )}
      </div>
      {plan.pro && (
        <p className="mt-3 text-xs text-subtle">O Pro cobre {formatNumber(plan.pro.pageQuota)} páginas por mês. O pagamento é feito pelo Stripe.</p>
      )}
    </section>
  );
}
