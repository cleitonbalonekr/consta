import { describe, expect, it } from "vitest";
import type { CaseFileProps } from "../case-files";
import type { Usage } from "../ports";
import { InMemoryUnitOfWork } from "../ports/fakes";
import { CaseFileId, LawyerId, QuotaExceeded } from "../shared";
import { Metering, Month } from "./index";

function setup(now = new Date("2026-10-15T12:00:00Z")) {
  const uow = new InMemoryUnitOfWork();
  const lawyer = LawyerId(crypto.randomUUID());
  const charge = (pages: number, createdAt: string) => uow.state.metering.charges.push({ lawyer, caseFileId: null, pages, createdAt: new Date(createdAt) });
  return { uow, lawyer, charge, metering: new Metering({ uow, now: () => now }) };
}

function caseFileProps(id: CaseFileId, lawyer: LawyerId): CaseFileProps {
  return {
    id,
    lawyer,
    name: "Autos.pdf",
    storageKey: `case-files/${id}.pdf`,
    uploadId: null,
    sizeBytes: 1_000,
    pageCount: 10,
    status: "ready",
    pagesDone: 10,
    error: null,
    unreadPages: [],
    createdAt: new Date("2026-10-01T12:00:00Z"),
    readyAt: new Date("2026-10-01T12:05:00Z"),
  };
}

describe("Metering.pagesLeft", () => {
  it("gives a lawyer who just started the Trial the whole Trial page quota", async () => {
    const { metering, lawyer } = setup();

    await metering.startTrial(lawyer);

    expect(await metering.pagesLeft(lawyer)).toBe(500);
  });

  it("subtracts the pages charged this month, but not those charged before it", async () => {
    const { metering, lawyer, charge } = setup();
    await metering.startTrial(lawyer);
    charge(120, "2026-10-02T10:00:00Z");
    charge(30, "2026-10-14T10:00:00Z");
    charge(400, "2026-09-05T10:00:00Z");

    expect(await metering.pagesLeft(lawyer)).toBe(350);
  });

  it("starts the month at midnight in São Paulo, not in UTC", async () => {
    // 02:00 UTC on 1 October is still 23:00 on 30 September in São Paulo.
    const { metering, lawyer, charge } = setup(new Date("2026-10-01T02:00:00Z"));
    await metering.startTrial(lawyer);
    charge(100, "2026-09-01T03:00:00Z"); // 00:00 on 1 September in São Paulo
    charge(200, "2026-09-01T02:59:00Z"); // 23:59 on 31 August in São Paulo

    expect(await metering.pagesLeft(lawyer)).toBe(400);
  });

  it("leaves no pages to a lawyer without a plan", async () => {
    const { metering, lawyer } = setup();

    expect(await metering.pagesLeft(lawyer)).toBe(0);
  });
});

describe("Metering.startTrial", () => {
  it("stores the Trial plan with its page quota", async () => {
    const { metering, lawyer, uow } = setup();

    await metering.startTrial(lawyer);

    expect(await uow.run((repos) => repos.metering.findPlan(lawyer))).toEqual({ plan: "trial", pageQuota: 500 });
  });

  it("keeps the plan a lawyer already has", async () => {
    const { metering, lawyer, uow } = setup();
    await uow.run((repos) => repos.metering.insertPlanIfMissing(lawyer, { plan: "pro", pageQuota: 5_000 }));

    await metering.startTrial(lawyer);

    expect(await metering.pagesLeft(lawyer)).toBe(5_000);
  });
});

describe("Metering.chargePages", () => {
  const caseFileId = () => CaseFileId(crypto.randomUUID());

  it("charges the pages of a case file that fits the quota", async () => {
    const { metering, lawyer } = setup();
    await metering.startTrial(lawyer);

    await metering.chargePages(lawyer, caseFileId(), 120);

    expect(await metering.pagesLeft(lawyer)).toBe(380);
  });

  it("charges a case file that uses the last page of the quota", async () => {
    const { metering, lawyer } = setup();
    await metering.startTrial(lawyer);

    await metering.chargePages(lawyer, caseFileId(), 500);

    expect(await metering.pagesLeft(lawyer)).toBe(0);
  });

  it("refuses a case file that doesn't fit, and charges nothing", async () => {
    const { metering, lawyer, charge } = setup();
    await metering.startTrial(lawyer);
    charge(450, "2026-10-02T10:00:00Z");

    const charging = metering.chargePages(lawyer, caseFileId(), 51);

    await expect(charging).rejects.toEqual(new QuotaExceeded(51, 50));
    expect(await metering.pagesLeft(lawyer)).toBe(50);
  });

  it("refuses every case file of a lawyer without a plan", async () => {
    const { metering, lawyer } = setup();

    await expect(metering.chargePages(lawyer, caseFileId(), 1)).rejects.toBeInstanceOf(QuotaExceeded);
  });

  it("charges a case file once, even when called again", async () => {
    const { metering, lawyer } = setup();
    await metering.startTrial(lawyer);
    const id = caseFileId();

    await metering.chargePages(lawyer, id, 300);
    await metering.chargePages(lawyer, id, 300);

    expect(await metering.pagesLeft(lawyer)).toBe(200);
  });
});

describe("Metering.record", () => {
  it("stores each provider call for the lawyer and the case file", async () => {
    const { metering, lawyer, uow } = setup();
    const caseFileId = CaseFileId(crypto.randomUUID());
    const embed = { kind: "embed", provider: "voyage", model: "voyage-4-lite", units: 1_200, unit: "token", costUsd: 0.000024 } as const;

    await metering.record(lawyer, caseFileId, [embed, { ...embed, units: 300, costUsd: 0.000006 }]);

    expect(uow.state.metering.usage).toEqual([
      { ...embed, lawyer, caseFileId, createdAt: expect.any(Date) },
      { ...embed, units: 300, costUsd: 0.000006, lawyer, caseFileId, createdAt: expect.any(Date) },
    ]);
  });
});

describe("Metering.givePagesBack", () => {
  it("gives a case file's pages back, once, and keeps the other charges", async () => {
    const { metering, lawyer, charge } = setup();
    await metering.startTrial(lawyer);
    charge(100, "2026-10-02T10:00:00Z");
    const caseFileId = CaseFileId(crypto.randomUUID());
    await metering.chargePages(lawyer, caseFileId, 40);

    await metering.givePagesBack(caseFileId);
    await metering.givePagesBack(caseFileId);

    expect(await metering.pagesLeft(lawyer)).toBe(400);
  });
});

describe("Metering.costs", () => {
  const usage = (kind: Usage["kind"], costUsd: number) => ({ kind, provider: "test", model: "test", units: 1, unit: "token" as const, costUsd });

  function seeded() {
    const { uow, metering } = setup();
    const ana = LawyerId(crypto.randomUUID());
    const bia = LawyerId(crypto.randomUUID());
    uow.state.lawyers.set(ana, { email: "ana@example.com" });
    uow.state.lawyers.set(bia, { email: "bia@example.com" });
    const [autosA, autosB] = [CaseFileId(crypto.randomUUID()), CaseFileId(crypto.randomUUID())];
    uow.state.caseFiles.set(autosA, { ...caseFileProps(autosA, ana), name: "Autos A.pdf" });
    uow.state.caseFiles.set(autosB, { ...caseFileProps(autosB, ana), name: "Autos B.pdf" });
    const add = (lawyer: LawyerId, caseFileId: CaseFileId | null, event: Usage, createdAt: string) =>
      uow.state.metering.usage.push({ ...event, lawyer, caseFileId, createdAt: new Date(createdAt) });
    return { metering, ana, bia, autosA, autosB, add };
  }

  it("totals each lawyer's and each case file's costs by kind, for the month in São Paulo", async () => {
    const { metering, ana, bia, autosA, autosB, add } = seeded();
    add(ana, autosA, usage("embed", 0.1), "2026-10-01T03:00:00Z"); // 00:00 on 1 October in São Paulo
    add(ana, autosA, usage("embed", 0.2), "2026-10-20T12:00:00Z");
    add(ana, autosA, usage("answer", 1.5), "2026-10-20T12:00:00Z");
    add(ana, autosB, usage("extract", 0.75), "2026-10-31T23:00:00Z");
    add(ana, null, usage("rerank", 0.05), "2026-10-05T12:00:00Z"); // a case file deleted since
    add(bia, null, usage("answer", 3), "2026-10-05T12:00:00Z");
    add(ana, autosA, usage("answer", 9), "2026-10-01T02:59:00Z"); // 23:59 on 30 September in São Paulo
    add(ana, autosA, usage("answer", 9), "2026-11-01T03:00:00Z"); // 00:00 on 1 November in São Paulo

    const report = await metering.costs(Month.parse("2026-10")!);

    const costs = (partial: Partial<Record<Usage["kind"], number>>, total: number) => ({ ocr: 0, embed: 0, rerank: 0, extract: 0, answer: 0, ...partial, total });
    expect(report.total).toEqual(costs({ embed: 0.3, rerank: 0.05, extract: 0.75, answer: 4.5 }, 5.6));
    expect(report.lawyers).toEqual([
      { lawyer: bia, email: "bia@example.com", costs: costs({ answer: 3 }, 3), caseFiles: [{ caseFileId: null, name: null, costs: costs({ answer: 3 }, 3) }] },
      {
        lawyer: ana,
        email: "ana@example.com",
        costs: costs({ embed: 0.3, rerank: 0.05, extract: 0.75, answer: 1.5 }, 2.6),
        caseFiles: [
          { caseFileId: autosA, name: "Autos A.pdf", costs: costs({ embed: 0.3, answer: 1.5 }, 1.8) },
          { caseFileId: autosB, name: "Autos B.pdf", costs: costs({ extract: 0.75 }, 0.75) },
          { caseFileId: null, name: null, costs: costs({ rerank: 0.05 }, 0.05) },
        ],
      },
    ]);
  });

  it("reports no lawyers and zero totals for a month without usage", async () => {
    const { metering, ana, add } = seeded();
    add(ana, null, usage("answer", 1), "2026-09-10T12:00:00Z");

    const report = await metering.costs(Month.parse("2026-10")!);

    expect(report.lawyers).toEqual([]);
    expect(report.total).toEqual({ ocr: 0, embed: 0, rerank: 0, extract: 0, answer: 0, total: 0 });
  });
});
