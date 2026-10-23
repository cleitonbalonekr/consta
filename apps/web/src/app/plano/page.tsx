import { PlanCard } from "@/components/plan-card";
import { container } from "@/server/container";
import { currentLawyer } from "@/server/lawyer";

export const dynamic = "force-dynamic";

/** The lawyer's plan, where they pay for Pro and come back from Stripe. A webhook changes the plan, a moment after Checkout. */
export default async function PlanPage() {
  const plan = await container().plans.view(await currentLawyer());

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Plano</h1>
      <p className="mt-2 text-muted">A cota de páginas renova no primeiro dia de cada mês.</p>
      <div className="mt-8">
        <PlanCard plan={plan} />
      </div>
    </main>
  );
}
