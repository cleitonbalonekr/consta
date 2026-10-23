import { usageKinds } from "../shared";
import type { UsageKind } from "../shared";

/** USD per usage kind, and their sum. */
export type CostsByKind = Record<UsageKind, number> & { total: number };

/** Sums costs in millionths of a dollar, the precision `usage_event` stores, so totals don't drift. */
export class CostTotals {
  private readonly micros = new Map<UsageKind, number>();

  static of(rows: Array<{ kind: UsageKind; costUsd: number }>): CostTotals {
    const totals = new CostTotals();
    for (const { kind, costUsd } of rows) totals.micros.set(kind, (totals.micros.get(kind) ?? 0) + Math.round(costUsd * 1e6));
    return totals;
  }

  costs(): CostsByKind {
    // fromEntries can't see that the keys are every UsageKind; usageKinds lists them all.
    const byKind = Object.fromEntries(usageKinds.map((kind) => [kind, (this.micros.get(kind) ?? 0) / 1e6])) as Record<UsageKind, number>;
    const total = [...this.micros.values()].reduce((sum, micros) => sum + micros, 0) / 1e6;
    return { ...byKind, total };
  }
}
