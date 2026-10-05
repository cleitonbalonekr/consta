import { LawyerId, NotFound } from "@consta/core";
import type { AnswerEvent, Answering, QuestionInput, Statement } from "@consta/core";
import { describe, expect, it } from "vitest";
import { createDemoModules, createDemoState } from "./index";

const lawyer = LawyerId("lawyer-1");
const otherLawyer = LawyerId("lawyer-2");

function demo() {
  const clock = { now: Date.parse("2026-10-04T12:00:00Z") };
  const now = () => clock.now;
  const state = createDemoState({ now });
  return { ...createDemoModules(state, { now, pause: async () => {} }), files: state.files, clock };
}

describe("demo CaseFiles", () => {
  it("lists a seeded, ready case file with its document map", async () => {
    const { caseFiles } = demo();

    const [seeded] = await caseFiles.list(lawyer);
    const view = await caseFiles.view(lawyer, seeded!.id);

    expect(view).toMatchObject({ name: "Autos de exemplo.pdf", status: "ready", pageCount: 10, pagesDone: 10 });
    expect(view.documentMap.map((peca) => [peca.type, peca.firstPage, peca.lastPage])).toEqual([
      ["outro", 1, 1],
      ["peticao-inicial", 2, 3],
      ["procuracao", 4, 4],
      ["contestacao", 5, 6],
      ["despacho", 7, 7],
      ["ata-de-audiencia", 8, 8],
      ["sentenca", 9, 10],
    ]);
    expect(await caseFiles.readUrl(lawyer, seeded!.id)).toBe("/demo/autos-de-exemplo.pdf");
  });

  it("takes an upload through queued, processing page by page, mapping and ready within a few seconds", async () => {
    const { caseFiles, files, clock } = demo();
    const pdf = new Uint8Array([37, 80, 68, 70]);

    const { caseFileId, uploadId, key } = await caseFiles.startUpload(lawyer, { name: "Autos 123.pdf", bytes: 4, pages: 6 });
    expect((await caseFiles.view(lawyer, caseFileId)).status).toBe("uploading");
    expect(await caseFiles.signUploadPart(lawyer, caseFileId, 1)).toMatch(/^\/api\/demo\/files\//);
    await files.putPart(key, uploadId, 1, pdf);
    expect((await caseFiles.uploadedParts(lawyer, caseFileId)).map((part) => part.partNumber)).toEqual([1]);

    const finished = await caseFiles.finishUpload(lawyer, caseFileId);
    expect(finished.status).toBe("queued");

    const seen: string[] = [];
    const started = clock.now;
    while ((await caseFiles.view(lawyer, caseFileId)).status !== "ready" && clock.now - started < 10_000) {
      const { status, pagesDone, pageCount } = await caseFiles.view(lawyer, caseFileId);
      const step = status === "processing" ? `processing ${pagesDone}/${pageCount}` : status;
      if (seen.at(-1) !== step) seen.push(step);
      clock.now += 50;
    }

    expect(clock.now - started).toBeLessThan(5_000);
    expect(seen).toEqual(["queued", ...[0, 1, 2, 3, 4, 5].map((n) => `processing ${n}/6`), "mapping"]);
    const ready = await caseFiles.view(lawyer, caseFileId);
    expect(ready.documentMap.length).toBeGreaterThan(0);
    expect(ready.documentMap.at(-1)?.lastPage).toBe(6);
    expect((await caseFiles.list(lawyer)).map((file) => file.name)).toEqual(["Autos 123.pdf", "Autos de exemplo.pdf"]);
    expect(await files.read(key)).toEqual(pdf);
    expect(await caseFiles.readUrl(lawyer, caseFileId)).toBe(`/api/demo/files/${key}`);
  });

  it.each([1, 2, 4, 5, 7])("maps every page of a %i-page upload to exactly one peça", async (pages) => {
    const { caseFiles, files, clock } = demo();
    const { caseFileId, uploadId, key } = await caseFiles.startUpload(lawyer, { name: "a.pdf", bytes: 1, pages });
    await files.putPart(key, uploadId, 1, new Uint8Array([1]));
    await caseFiles.finishUpload(lawyer, caseFileId);
    clock.now += 10_000;

    const { documentMap } = await caseFiles.view(lawyer, caseFileId);

    const covered = documentMap.flatMap((peca) =>
      Array.from({ length: peca.lastPage - peca.firstPage + 1 }, (_, i) => peca.firstPage + i),
    );
    expect(documentMap.every((peca) => peca.firstPage <= peca.lastPage)).toBe(true);
    expect(covered).toEqual(Array.from({ length: pages }, (_, i) => i + 1));
  });

  it("finishes an upload only once", async () => {
    const { caseFiles, files, clock } = demo();
    const { caseFileId, uploadId, key } = await caseFiles.startUpload(lawyer, { name: "a.pdf", bytes: 1, pages: 1 });
    await files.putPart(key, uploadId, 1, new Uint8Array([1]));
    await caseFiles.finishUpload(lawyer, caseFileId);
    clock.now += 1_000;

    const again = await caseFiles.finishUpload(lawyer, caseFileId);

    expect(again.status).not.toBe("queued");
  });

  it("refuses an upload over the page quota before anything is stored, when the file is scripted to", async () => {
    const { caseFiles } = demo();

    await expect(caseFiles.startUpload(lawyer, { name: "autos-sem-cota.pdf", bytes: 1, pages: 900 })).rejects.toMatchObject({
      name: "QuotaExceeded",
      pagesNeeded: 900,
    });
    expect(await caseFiles.list(lawyer)).toHaveLength(1);
  });

  it("fails ingestion with a reason the lawyer can read, when the file is scripted to", async () => {
    const { caseFiles, files, clock } = demo();
    const { caseFileId, uploadId, key } = await caseFiles.startUpload(lawyer, { name: "autos-falha.pdf", bytes: 1, pages: 8 });
    await files.putPart(key, uploadId, 1, new Uint8Array([1]));
    await caseFiles.finishUpload(lawyer, caseFileId);

    clock.now += 10_000;
    const view = await caseFiles.view(lawyer, caseFileId);

    expect(view).toMatchObject({ status: "failed", pagesDone: 3 });
    expect(view.error).toMatch(/página 4/);
    expect(view.documentMap).toEqual([]);
  });

  it("removes a case file and its PDF", async () => {
    const { caseFiles, files } = demo();
    const { caseFileId, uploadId, key } = await caseFiles.startUpload(lawyer, { name: "a.pdf", bytes: 1, pages: 1 });
    await files.putPart(key, uploadId, 1, new Uint8Array([1]));
    await caseFiles.finishUpload(lawyer, caseFileId);

    await caseFiles.remove(lawyer, caseFileId);

    expect((await caseFiles.list(lawyer)).map((file) => file.id)).not.toContain(caseFileId);
    await expect(caseFiles.view(lawyer, caseFileId)).rejects.toBeInstanceOf(NotFound);
    await expect(files.read(key)).rejects.toThrow();
  });

  it("gives each lawyer their own copy of the sample case file", async () => {
    const { caseFiles } = demo();
    const [mine] = await caseFiles.list(lawyer);

    await caseFiles.remove(lawyer, mine!.id);

    expect(await caseFiles.list(lawyer)).toEqual([]);
    expect((await caseFiles.list(otherLawyer)).map((file) => [file.id, file.name])).toEqual([[mine!.id, "Autos de exemplo.pdf"]]);
  });

  it("hides a lawyer's case files from every other lawyer", async () => {
    const { caseFiles, answering } = demo();
    const [sample] = await caseFiles.list(otherLawyer);
    await caseFiles.remove(otherLawyer, sample!.id);
    const { caseFileId } = await caseFiles.startUpload(lawyer, { name: "Autos 123.pdf", bytes: 1, pages: 1 });

    expect(await caseFiles.list(otherLawyer)).toEqual([]);
    await expect(caseFiles.view(otherLawyer, caseFileId)).rejects.toBeInstanceOf(NotFound);
    await expect(caseFiles.readUrl(otherLawyer, caseFileId)).rejects.toBeInstanceOf(NotFound);
    await expect(caseFiles.remove(otherLawyer, caseFileId)).rejects.toBeInstanceOf(NotFound);
    await expect(collect(answering, { caseFileId, quickAction: "people" }, otherLawyer)).rejects.toBeInstanceOf(NotFound);
    expect((await caseFiles.list(lawyer)).map((file) => file.id)).toContain(caseFileId);
  });
});

async function collect(answering: Answering, question: QuestionInput, asker = lawyer) {
  const events: AnswerEvent[] = [];
  for await (const event of answering.ask(asker, question)) events.push(event);
  return events;
}

const statementsOf = (events: AnswerEvent[]): Statement[] =>
  events.flatMap((event) => (event.type === "statement" ? [event.statement] : []));

describe("demo Answering", () => {
  it("answers a whole-file question with cited statements and drops the scripted uncited one", async () => {
    const { caseFiles, answering } = demo();
    const [seeded] = await caseFiles.list(lawyer);

    const events = await collect(answering, { caseFileId: seeded!.id, scope: { kind: "whole-file" }, text: "Do que trata a ação?" });

    const statements = statementsOf(events);
    expect(statements).toHaveLength(4);
    expect(statements.every((statement) => statement.citations.length > 0)).toBe(true);
    expect(statements[0]!.citations[0]).toMatchObject({ page: 2, folha: "2", quote: expect.stringContaining("15/01/2026") });
    expect(events.at(-1)).toMatchObject({ type: "done", dropped: 1 });
  });

  it("cites only pages of the chosen peça", async () => {
    const { caseFiles, answering } = demo();
    const [seeded] = await caseFiles.list(lawyer);
    const sentenca = (await caseFiles.view(lawyer, seeded!.id)).documentMap.find((peca) => peca.type === "sentenca")!;

    const events = await collect(answering, {
      caseFileId: seeded!.id,
      scope: { kind: "peca", pecaId: sentenca.id },
      text: "Qual foi a condenação?",
    });

    const pages = statementsOf(events).flatMap((statement) => statement.citations.map((citation) => citation.page));
    expect(pages.length).toBeGreaterThan(0);
    expect(pages.every((page) => page >= 9 && page <= 10)).toBe(true);
  });

  it.each(["timeline", "people", "amounts"] as const)("answers the %s quick action with a cited list", async (quickAction) => {
    const { caseFiles, answering } = demo();
    const [seeded] = await caseFiles.list(lawyer);

    const statements = statementsOf(await collect(answering, { caseFileId: seeded!.id, quickAction }));

    expect(statements.length).toBeGreaterThan(2);
    expect(statements.every((statement) => statement.citations.length > 0)).toBe(true);
  });

  it("refuses a question about a case file that isn't ready", async () => {
    const { caseFiles, answering } = demo();
    const { caseFileId } = await caseFiles.startUpload(lawyer, { name: "a.pdf", bytes: 1, pages: 1 });

    const events = await collect(answering, { caseFileId, scope: { kind: "whole-file" }, text: "?" });

    expect(events).toEqual([{ type: "refused", reason: "not-ready" }]);
  });

  it("answers about an uploaded case file once it is ready", async () => {
    const { caseFiles, files, answering, clock } = demo();
    const { caseFileId, uploadId, key } = await caseFiles.startUpload(lawyer, { name: "a.pdf", bytes: 1, pages: 9 });
    await files.putPart(key, uploadId, 1, new Uint8Array([1]));
    await caseFiles.finishUpload(lawyer, caseFileId);
    clock.now += 10_000;

    const events = await collect(answering, { caseFileId, scope: { kind: "whole-file" }, text: "?" });

    expect(statementsOf(events).length).toBeGreaterThan(0);
    expect(events.at(-1)).toMatchObject({ type: "done", dropped: 1 });
  });
});
