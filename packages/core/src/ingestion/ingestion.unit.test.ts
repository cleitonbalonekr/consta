import { describe, expect, it } from "vitest";
import type { Embedder } from "../ports";
import { FakeEmbedder, InMemoryUnitOfWork } from "../ports/fakes";
import { LawyerId, PageRange } from "../shared";
import type { CaseFileId } from "../shared";
import { Ingestion, PAGES_PER_BATCH, RANGE_ATTEMPTS } from "./index";
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

describe("Ingestion.plan", () => {
  it("splits the case file into ranges of 100 pages and records each one once", async () => {
    const { ingestion, upload, lawyer, uow } = await setup({ startIngestion: false });
    const caseFileId = await upload(lawyer, await fixturePdf(Array.from({ length: 250 }, () => "scanned")), 250);

    const ranges = await ingestion.plan(caseFileId);
    await ingestion.plan(caseFileId);

    expect(ranges.map(({ first, last }) => [first, last])).toEqual([
      [1, 100],
      [101, 200],
      [201, 250],
    ]);
    expect(uow.state.ingestion.ranges.filter((range) => range.caseFileId === caseFileId)).toHaveLength(3);
  });
});

describe("Ingestion of digital pages", () => {
  it("reads every page with its folha, splits it into passages and marks the case file ready", async () => {
    const { caseFiles, lawyer, ingest, pagesOf, passagesOf } = await setup();

    const caseFileId = await ingest(digital(3));

    expect(await caseFiles.view(lawyer, caseFileId)).toMatchObject({ status: "ready", pagesDone: 3, unreadPages: [], documentMap: [] });
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

    const usage = uow.state.metering.usage.filter((event) => event.caseFileId === caseFileId);
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

describe("Ingestion.ingestRange", () => {
  it("replaces only its own range's pages and passages when it runs again", async () => {
    const { ingestion, upload, lawyer, pagesOf, passagesOf } = await setup({ startIngestion: false });
    const caseFileId = await upload(lawyer, await fixturePdf(digital(101)), 101);
    const [first, second] = await ingestion.plan(caseFileId);
    await ingestion.ingestRange(caseFileId, first!);
    await ingestion.ingestRange(caseFileId, second!);
    const before = passagesOf(caseFileId);

    await ingestion.ingestRange(caseFileId, first!);

    expect(pagesOf(caseFileId)).toHaveLength(101);
    expect(passagesOf(caseFileId)).toHaveLength(before.length);
    // The second range's passage is the very same row; the first range's were written again.
    expect(passagesOf(caseFileId).filter((passage) => passage.page === 101)[0]).toBe(before.find((passage) => passage.page === 101));
    expect(passagesOf(caseFileId).filter((passage) => passage.page === 1)[0]).not.toBe(before.find((passage) => passage.page === 1));
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

describe("Ingestion.map", () => {
  it("refuses to mark the case file ready while a range is not done", async () => {
    const { ingestion, upload, lawyer, caseFiles } = await setup({ startIngestion: false });
    const caseFileId = await upload(lawyer, await fixturePdf(digital(2)), 2);
    await ingestion.plan(caseFileId);

    await expect(ingestion.map(caseFileId)).rejects.toThrow("ranges not done");
    expect((await caseFiles.view(lawyer, caseFileId)).status).toBe("queued");
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

  it("fails only once and gives the pages back only once when fail is called again", async () => {
    const { ingestion, caseFiles, metering, lawyer, upload } = await setup({ startIngestion: false });
    const caseFileId = await upload(lawyer, await fixturePdf(digital(2)), 2);

    await ingestion.fail(caseFileId, "Não conseguimos ler as páginas 1 a 2.");
    await ingestion.fail(caseFileId, "Outro motivo.");

    expect(await caseFiles.view(lawyer, caseFileId)).toMatchObject({ status: "failed", error: "Não conseguimos ler as páginas 1 a 2." });
    expect(await metering.pagesLeft(lawyer)).toBe(500);
  });

  it.each([
    [[[101, 200]], "Não conseguimos ler as páginas 101 a 200."],
    [[[7, 7]], "Não conseguimos ler a página 7."],
    [[[1, 100], [201, 300], [401, 401]], "Não conseguimos ler as páginas 1 a 100, 201 a 300 e 401."],
  ])("words the reason for the ranges %j for the lawyer", (ranges, reason) => {
    expect(Ingestion.unreadRangesReason(ranges.map(([first, last]) => PageRange.from(first!, last!)))).toBe(reason);
  });
});
