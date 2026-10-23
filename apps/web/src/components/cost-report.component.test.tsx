import { CaseFileId, LawyerId, Month } from "@consta/core";
import type { CostReport, UsageKind } from "@consta/core";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CostReportTable } from "./cost-report";

afterEach(cleanup);

const costs = (partial: Partial<Record<UsageKind, number>>, total: number) => ({
  ocr: 0,
  embed: 0,
  rerank: 0,
  extract: 0,
  answer: 0,
  ...partial,
  total,
});

const ana = LawyerId("lawyer-ana");
const autos = CaseFileId("case-file-1");

const report: CostReport = {
  month: Month.parse("2026-10")!,
  total: costs({ embed: 0.0003, answer: 1.5, extract: 0.21 }, 1.7103),
  lawyers: [
    {
      lawyer: ana,
      email: "ana@example.com",
      costs: costs({ embed: 0.0003, answer: 1.5, extract: 0.21 }, 1.7103),
      caseFiles: [
        { caseFileId: autos, name: "Autos 123.pdf", costs: costs({ embed: 0.0003, extract: 0.21 }, 0.2103) },
        { caseFileId: null, name: null, costs: costs({ answer: 1.5 }, 1.5) },
      ],
    },
  ],
};

/** Intl puts a no-break space after "US$". */
const text = (element: HTMLElement | null) => element?.textContent?.replace(/\s/g, " ") ?? "";

describe("CostReportTable", () => {
  it("shows each lawyer's total by kind, with a row per case file", () => {
    render(<CostReportTable report={report} />);

    const lawyerRow = document.getElementById(`costs-lawyer-${ana}`);
    expect(text(lawyerRow)).toContain("ana@example.com");
    expect(text(lawyerRow)).toContain("US$ 0,0003");
    expect(text(lawyerRow)).toContain("US$ 1,7103");
    expect(text(document.getElementById(`costs-case-file-${ana}-${autos}`))).toContain("Autos 123.pdf");
    expect(text(document.getElementById(`costs-case-file-${ana}-none`))).toContain("Sem autos");
    expect(text(document.getElementById("costs-total"))).toContain("US$ 1,7103");
  });

  it("says when the month has no costs", () => {
    render(<CostReportTable report={{ ...report, lawyers: [], total: costs({}, 0) }} />);

    expect(screen.getByText("Nenhum custo registrado neste mês.")).toBeDefined();
    expect(document.getElementById("costs-total")).toBeNull();
  });
});
