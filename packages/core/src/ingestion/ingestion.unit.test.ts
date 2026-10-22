import { describe, expect, it } from "vitest";
import type { Embedder, FactDraft, MapExtractor, PecaDraft } from "../ports";
import { FakeEmbedder, FakeMapExtractor, InMemoryUnitOfWork } from "../ports/fakes";
import { LawyerId } from "../shared";
import type { CaseFileId, PageRange } from "../shared";
import { PAGES_PER_BATCH, RANGE_ATTEMPTS } from "./index";
import type { RangeRunner } from "./index";
import { digitalLines, fixturePdf, ingestionOn } from "./testing";
import type { FixturePage } from "./testing";

/** Fails the calls that `fails` picks, counted from 1, as a provider outage would, and embeds like the fake otherwise. */
class FlakyEmbedder extends FakeEmbedder implements Embedder {
  calls = 0;

  constructor(private readonly fails: (call: number) => boolean) {
    super();
  }

  override async embed(texts: string[], as: "passage" | "question") {
    if (this.fails(++this.calls)) throw new Error("Voyage is down.");
    return super.embed(texts, as);
  }
}

async function setup(options: Parameters<typeof ingestionOn>[1] = {}) {
  const uow = new InMemoryUnitOfWork();
  const lawyer = LawyerId(crypto.randomUUID());
  const built = ingestionOn(uow, options);
  await built.metering.startTrial(lawyer);
  const pagesOf = (caseFileId: CaseFileId) => uow.state.ingestion.pages.filter((page) => page.caseFileId === caseFileId);
  const passagesOf = (caseFileId: CaseFileId) => uow.state.ingestion.passages.filter((passage) => passage.caseFileId === caseFileId);
  /** Uploads a fixture PDF and waits until ingestion ends. */
  async function ingest(pages: FixturePage[]) {
    const caseFileId = await built.upload(lawyer, await fixturePdf(pages), pages.length);
    await built.jobs.idle();
    return caseFileId;
  }
  return { ...built, uow, lawyer, pagesOf, passagesOf, ingest };
}

const digital = (pages: number): FixturePage[] => Array.from({ length: pages }, () => "digital");
const scanned = (pages: number): FixturePage[] => Array.from({ length: pages }, () => "scanned");

type MapInput = Parameters<MapExtractor["extract"]>[0];

/** A fake extractor that records each window it reads and answers with `read`. */
function recordingExtractor(read: (input: MapInput) => { pecas: PecaDraft[]; facts: FactDraft[] }) {
  const windows: MapInput[] = [];
  const extractor = new FakeMapExtractor((input) => {
    windows.push(input);
    return read(input);
  });
  return { extractor, windows };
}

/** Each window is one peça, continuing the open one when there is one. */
const onePecaPerWindow = ({ pages, openPeca }: MapInput) => ({
  pecas: [
    {
      type: "peticao-inicial" as const,
      title: "Petição inicial",
      date: "2026-03-10",
      firstPage: openPeca?.firstPage ?? pages[0]!.page,
      lastPage: pages.at(-1)!.page,
      summary: "A autora pede indenização por danos morais.",
    },
  ],
  facts: [],
});

/** A runner that reads none of the ranges and reports the ones `unread` picks by position. */
const reportingUnread = (unread: (index: number) => boolean, planned: PageRange[] = []): RangeRunner => ({
  async run(_caseFileId, ranges) {
    planned.push(...ranges);
    return ranges.filter((_, index) => unread(index));
  },
});

describe("Ingestion.ingest with a range runner", () => {
  it("hands the runner ranges of 100 pages, and records each range once", async () => {
    const { ingestion, upload, lawyer, uow } = await setup({ startIngestion: false });
    const caseFileId = await upload(lawyer, await fixturePdf(scanned(250)), 250);
    const planned: PageRange[] = [];

    await ingestion.ingest(caseFileId, reportingUnread(() => true, planned));
    await ingestion.ingest(caseFileId, reportingUnread(() => true));

    expect(planned.map(({ first, last }) => [first, last])).toEqual([
      [1, 100],
      [101, 200],
      [201, 250],
    ]);
    expect(uow.state.ingestion.ranges.filter((range) => range.caseFileId === caseFileId)).toHaveLength(3);
  });

  it.each([
    [250, [1], "Não conseguimos ler as páginas 101 a 200."],
    [101, [1], "Não conseguimos ler a página 101."],
    [401, [0, 2, 4], "Não conseguimos ler as páginas 1 a 100, 201 a 300 e 401."],
  ])("fails a case file of %i pages whose ranges %j were not read with the reason %j, and gives the pages back", async (pages, unread, reason) => {
    const { ingestion, upload, lawyer, caseFiles, metering } = await setup({ startIngestion: false });
    const caseFileId = await upload(lawyer, await fixturePdf(scanned(pages)), pages);

    await ingestion.ingest(caseFileId, reportingUnread((index) => unread.includes(index)));

    expect(await caseFiles.view(lawyer, caseFileId)).toMatchObject({ status: "failed", error: reason });
    expect(await metering.pagesLeft(lawyer)).toBe(500);
  });

  it("fails the case file with a general reason, and throws, when a runner reports every range read but one is not", async () => {
    const { ingestion, upload, lawyer, caseFiles } = await setup({ startIngestion: false });
    const caseFileId = await upload(lawyer, await fixturePdf(digital(2)), 2);

    await expect(ingestion.ingest(caseFileId, reportingUnread(() => false))).rejects.toThrow("ranges not done");

    expect(await caseFiles.view(lawyer, caseFileId)).toMatchObject({ status: "failed", error: "Não conseguimos ler este arquivo." });
  });
});

describe("Ingestion of digital pages", () => {
  it("reads every page with its folha, splits it into passages and marks the case file ready", async () => {
    const { caseFiles, lawyer, ingest, pagesOf, passagesOf } = await setup();

    const caseFileId = await ingest(digital(3));

    expect(await caseFiles.view(lawyer, caseFileId)).toMatchObject({ status: "ready", pagesDone: 3, unreadPages: [] });
    expect(pagesOf(caseFileId).map(({ number, folha, source }) => ({ number, folha, source }))).toEqual([
      { number: 1, folha: "2", source: "digital" },
      { number: 2, folha: "3", source: "digital" },
      { number: 3, folha: "4", source: "digital" },
    ]);
    expect(pagesOf(caseFileId)[1]!.text).toContain(digitalLines(2).join("\n"));
    expect(passagesOf(caseFileId).map((passage) => passage.page)).toEqual([1, 2, 3]);
  });

  it("keeps each passage inside its page, with the indexes of the blocks it came from", async () => {
    const { ingest, pagesOf, passagesOf } = await setup();

    const caseFileId = await ingest(digital(2));

    for (const passage of passagesOf(caseFileId)) {
      const page = pagesOf(caseFileId).find((stored) => stored.number === passage.page)!;
      expect(passage.text).toBe(passage.blockIndexes.map((i) => page.blocks[i]!.text).join("\n"));
      expect(passage.text).not.toMatch(new RegExp(`Página ${passage.page === 1 ? 2 : 1}:`));
      expect(passage).toMatchObject({ embeddingModel: "fake-embedder", embedding: expect.any(Array) });
    }
  });

  it("records the cost of every embedding call for the lawyer and the case file", async () => {
    const { ingest, uow, lawyer } = await setup();

    const caseFileId = await ingest(digital(PAGES_PER_BATCH + 1));

    const usage = uow.state.metering.usage.filter((event) => event.caseFileId === caseFileId && event.kind === "embed");
    expect(usage).toHaveLength(2);
    for (const event of usage) expect(event).toMatchObject({ lawyer, kind: "embed", model: "fake-embedder" });
  });

  it("moves the progress after every batch of pages", async () => {
    const seen: number[] = [];
    const embedder = new FakeEmbedder();
    const { ingest, uow } = await setup({
      embedder: {
        model: embedder.model,
        dimensions: embedder.dimensions,
        embed: (texts, as) => {
          seen.push(...[...uow.state.caseFiles.values()].map((props) => props.pagesDone));
          return embedder.embed(texts, as);
        },
      },
    });

    await ingest(digital(2 * PAGES_PER_BATCH + 5));

    expect(seen).toEqual([0, PAGES_PER_BATCH, 2 * PAGES_PER_BATCH]);
  });
});

describe("Ingestion of scanned pages", () => {
  it("stores scanned pages with no text and no passages, and the lawyer sees them as not read", async () => {
    const { caseFiles, lawyer, ingest, pagesOf, passagesOf } = await setup();

    const caseFileId = await ingest(["digital", "scanned", "scanned", "digital", "scanned"]);

    expect(await caseFiles.view(lawyer, caseFileId)).toMatchObject({
      status: "ready",
      unreadPages: [
        { first: 2, last: 3 },
        { first: 5, last: 5 },
      ],
    });
    const scanned = pagesOf(caseFileId).filter((page) => page.source === "scanned");
    expect(scanned.map(({ number, folha, text, blocks }) => ({ number, folha, text, blocks }))).toEqual([
      { number: 2, folha: "3", text: "", blocks: [] },
      { number: 3, folha: "4", text: "", blocks: [] },
      { number: 5, folha: "6", text: "", blocks: [] },
    ]);
    expect(passagesOf(caseFileId).map((passage) => passage.page)).toEqual([1, 4]);
  });
});

describe("Ingestion's document map", () => {
  it("builds the document map from the pages, then marks the case file ready", async () => {
    const { caseFiles, lawyer, ingest } = await setup({ mapExtractor: recordingExtractor(onePecaPerWindow).extractor });

    const caseFileId = await ingest(digital(3));

    expect(await caseFiles.view(lawyer, caseFileId)).toMatchObject({
      status: "ready",
      documentMap: [
        {
          id: expect.any(String),
          type: "peticao-inicial",
          title: "Petição inicial",
          date: "2026-03-10",
          firstPage: 1,
          lastPage: 3,
          summary: "A autora pede indenização por danos morais.",
        },
      ],
    });
  });

  it("reads the pages in windows, and merges a peça that continues into the next window", async () => {
    const { extractor, windows } = recordingExtractor(onePecaPerWindow);
    const { caseFiles, lawyer, ingest } = await setup({ mapExtractor: extractor });

    const caseFileId = await ingest(Array.from({ length: 30 }, () => "full"));

    expect(windows.length).toBeGreaterThan(1);
    expect(windows.flatMap((window) => window.pages.map((page) => page.page))).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
    expect(windows[0]!.openPeca).toBeNull();
    expect(windows[1]!.openPeca).toMatchObject({ firstPage: 1 });
    expect((await caseFiles.view(lawyer, caseFileId)).documentMap.map((peca) => [peca.firstPage, peca.lastPage])).toEqual([[1, 30]]);
  });

  it("gives the extractor each page's text, and a scanned page with no text", async () => {
    const { extractor, windows } = recordingExtractor(onePecaPerWindow);
    const { ingest } = await setup({ mapExtractor: extractor });

    await ingest(["digital", "scanned", "digital"]);

    const [first, scannedPage, third] = windows[0]!.pages;
    expect(first!.text).toContain(digitalLines(1)[1]);
    expect(scannedPage).toEqual({ page: 2, text: "" });
    expect(third!.text).toContain(digitalLines(3)[1]);
  });

  it("stores each fact with its page", async () => {
    const fact: FactDraft = { kind: "amount", value: "R$ 10.000,00", normalizedValue: "10000.00", context: "danos morais", page: 2 };
    const { extractor } = recordingExtractor((input) => ({ ...onePecaPerWindow(input), facts: [fact] }));
    const { uow, ingest } = await setup({ mapExtractor: extractor });

    const caseFileId = await ingest(digital(3));

    expect(uow.state.ingestion.facts).toEqual([{ ...fact, caseFileId }]);
  });

  it("records the cost of every window for the lawyer and the case file", async () => {
    const { extractor, windows } = recordingExtractor(onePecaPerWindow);
    const { uow, lawyer, ingest } = await setup({ mapExtractor: extractor });

    const caseFileId = await ingest(Array.from({ length: 30 }, () => "full"));

    const extracts = uow.state.metering.usage.filter((event) => event.kind === "extract");
    expect(extracts).toHaveLength(windows.length);
    for (const event of extracts) expect(event).toMatchObject({ lawyer, caseFileId });
  });

  it("builds one document map when the extractor fails once", async () => {
    let calls = 0;
    const { extractor } = recordingExtractor((input) => {
      if (++calls === 1) throw new Error("Claude is down.");
      return onePecaPerWindow(input);
    });
    const { caseFiles, lawyer, ingest } = await setup({ mapExtractor: extractor });

    const caseFileId = await ingest(digital(3));

    const view = await caseFiles.view(lawyer, caseFileId);
    expect(view.status).toBe("ready");
    expect(view.documentMap).toHaveLength(1);
  });

  it("fails the case file and gives the pages back when the extractor fails on every attempt", async () => {
    const { extractor } = recordingExtractor(() => {
      throw new Error("Claude is down.");
    });
    const { caseFiles, metering, lawyer, ingest } = await setup({ mapExtractor: extractor });

    const caseFileId = await ingest(digital(3));

    expect(await caseFiles.view(lawyer, caseFileId)).toMatchObject({ status: "failed", error: "Não conseguimos ler este arquivo.", documentMap: [] });
    expect(await metering.pagesLeft(lawyer)).toBe(500);
  });
});

describe("Ingestion.ingestRange", () => {
  it("replaces only its own range's pages and passages when it runs again", async () => {
    const { ingestion, upload, lawyer, pagesOf, passagesOf } = await setup({ startIngestion: false });
    const caseFileId = await upload(lawyer, await fixturePdf(digital(101)), 101);
    let before: ReturnType<typeof passagesOf> = [];
    let after: ReturnType<typeof passagesOf> = [];

    await ingestion.ingest(caseFileId, {
      async run(id, [first, second]) {
        await ingestion.ingestRange(id, first!);
        await ingestion.ingestRange(id, second!);
        before = passagesOf(id);
        await ingestion.ingestRange(id, first!);
        after = passagesOf(id);
        return [];
      },
    });

    expect(pagesOf(caseFileId)).toHaveLength(101);
    expect(after).toHaveLength(before.length);
    // The second range's passage is the very same row; the first range's were written again.
    expect(after.filter((passage) => passage.page === 101)[0]).toBe(before.find((passage) => passage.page === 101));
    expect(after.filter((passage) => passage.page === 1)[0]).not.toBe(before.find((passage) => passage.page === 1));
  });

  it("leaves no passages of a failed attempt behind when the range runs again", async () => {
    // The second call fails: the first batch of the range is saved, the second is not.
    const { caseFiles, lawyer, ingest, passagesOf, uow } = await setup({ embedder: new FlakyEmbedder((call) => call === 2) });

    const caseFileId = await ingest(digital(PAGES_PER_BATCH + 2));

    expect((await caseFiles.view(lawyer, caseFileId)).status).toBe("ready");
    expect(passagesOf(caseFileId).map((passage) => passage.page)).toEqual(Array.from({ length: PAGES_PER_BATCH + 2 }, (_, i) => i + 1));
    expect(uow.state.ingestion.ranges.find((range) => range.caseFileId === caseFileId)).toMatchObject({ status: "done", attempts: 2 });
  });
});

describe("Ingestion failures", () => {
  it(`fails the case file after ${RANGE_ATTEMPTS} attempts of a range, with a reason, and gives the pages back`, async () => {
    const embedder = new FlakyEmbedder(() => true);
    const { caseFiles, metering, lawyer, ingest } = await setup({ embedder });

    const caseFileId = await ingest(digital(7));

    expect(embedder.calls).toBe(RANGE_ATTEMPTS);
    expect(await caseFiles.view(lawyer, caseFileId)).toMatchObject({ status: "failed", error: "Não conseguimos ler as páginas 1 a 7." });
    expect(await metering.pagesLeft(lawyer)).toBe(500);
  });

  it("reads the case file when a range fails fewer times than its attempts", async () => {
    const { caseFiles, lawyer, ingest } = await setup({ embedder: new FlakyEmbedder((call) => call < RANGE_ATTEMPTS) });

    const caseFileId = await ingest(digital(2));

    expect((await caseFiles.view(lawyer, caseFileId)).status).toBe("ready");
  });

  it("reports every range that failed, not only the first", async () => {
    // Every call fails, so both ranges fail on every attempt.
    const { caseFiles, lawyer, ingest } = await setup({ embedder: new FlakyEmbedder(() => true) });

    const caseFileId = await ingest(digital(101));

    expect(await caseFiles.view(lawyer, caseFileId)).toMatchObject({ status: "failed", error: "Não conseguimos ler as páginas 1 a 100 e 101." });
  });

  it("keeps the first reason and gives the pages back only once when it gives up after failing", async () => {
    const { ingestion, caseFiles, metering, lawyer, upload } = await setup({ startIngestion: false });
    const caseFileId = await upload(lawyer, await fixturePdf(digital(2)), 2);

    await ingestion.ingest(caseFileId, reportingUnread(() => true));
    await ingestion.giveUp(caseFileId);
    await ingestion.giveUp(caseFileId);

    expect(await caseFiles.view(lawyer, caseFileId)).toMatchObject({ status: "failed", error: "Não conseguimos ler as páginas 1 a 2." });
    expect(await metering.pagesLeft(lawyer)).toBe(500);
  });

  it("does not give up on a case file that is ready", async () => {
    const { ingestion, caseFiles, lawyer, ingest } = await setup();
    const caseFileId = await ingest(digital(1));

    await ingestion.giveUp(caseFileId);

    expect((await caseFiles.view(lawyer, caseFileId)).status).toBe("ready");
  });
});
