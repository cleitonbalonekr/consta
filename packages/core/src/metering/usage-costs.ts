import type { CaseFileId, LawyerId } from "../shared";
import { CostTotals } from "./cost-totals";
import type { CostsByKind } from "./cost-totals";
import type { CostReport, UsageCost } from "./index";
import type { Month } from "./month";

/** A month's usage costs, grouped into the operator's report. */
export class UsageCosts {
  constructor(private readonly rows: UsageCost[]) {}

  /** Lawyers and their case files come most expensive first. */
  report(month: Month): CostReport {
    const lawyers = [...UsageCosts.groupBy(this.rows, (row) => row.lawyer)].map(([lawyer, ofLawyer]) => ({
      lawyer,
      email: ofLawyer[0].email,
      costs: CostTotals.of(ofLawyer).costs(),
      caseFiles: UsageCosts.byCaseFile(ofLawyer),
    }));
    return { month, total: CostTotals.of(this.rows).costs(), lawyers: UsageCosts.mostExpensiveFirst(lawyers) };
  }

  private static byCaseFile(ofLawyer: UsageCost[]): Array<{ caseFileId: CaseFileId | null; name: string | null; costs: CostsByKind }> {
    const caseFiles = [...UsageCosts.groupBy(ofLawyer, (row) => row.caseFileId)].map(([caseFileId, ofCaseFile]) => ({
      caseFileId,
      name: ofCaseFile[0].caseFileName,
      costs: CostTotals.of(ofCaseFile).costs(),
    }));
    return UsageCosts.mostExpensiveFirst(caseFiles);
  }

  /** Each group's rows in the order they came, groups in the order their first row came. */
  private static groupBy<K extends LawyerId | CaseFileId | null>(rows: UsageCost[], key: (row: UsageCost) => K): Map<K, [UsageCost, ...UsageCost[]]> {
    const groups = new Map<K, [UsageCost, ...UsageCost[]]>();
    for (const row of rows) {
      const group = groups.get(key(row));
      if (group) group.push(row);
      else groups.set(key(row), [row]);
    }
    return groups;
  }

  private static mostExpensiveFirst<T extends { costs: CostsByKind }>(items: T[]): T[] {
    return [...items].sort((a, b) => b.costs.total - a.costs.total);
  }
}
