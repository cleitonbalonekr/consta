import { describe, expect, it } from "vitest";
import { citingModelContract, embedderContract, fileStoreContract, mapExtractorContract, rerankerContract } from "../contracts";
import { FakeCitingModel, FakeEmbedder, FakeMapExtractor, FakeReranker, InMemoryFileStore, InMemoryMailer } from "./index";

describe("InMemoryFileStore", () => {
  fileStoreContract(async () => {
    const files = new InMemoryFileStore();
    return { files, putPart: (url, bytes) => files.putPart(url, bytes), readRange: (url, range) => files.readRange(url, range) };
  });
});

describe("FakeEmbedder", () => {
  embedderContract(async () => ({ embedder: new FakeEmbedder() }));

  it("places texts that share words closer than texts that don't", async () => {
    const { vectors } = await new FakeEmbedder(64).embed(
      ["sentença de mérito", "a sentença foi publicada", "laudo pericial contábil"],
      "passage",
    );
    const dot = (a: number[], b: number[]) => a.reduce((sum, value, i) => sum + value * b[i]!, 0);
    expect(dot(vectors[0]!, vectors[1]!)).toBeGreaterThan(dot(vectors[0]!, vectors[2]!));
  });
});

describe("FakeReranker", () => {
  rerankerContract(async () => ({ reranker: new FakeReranker() }));
});

describe("FakeMapExtractor", () => {
  mapExtractorContract(async () => ({ extractor: new FakeMapExtractor() }));

  it("maps a window, by default, as peças of two pages, each of the next type in the order of a lawsuit", async () => {
    const pages = [1, 2, 3, 4, 5].map((page) => ({ page, text: `Página ${page}` }));

    const { pecas } = await new FakeMapExtractor().extract({ pages, openPeca: null });

    expect(pecas.map(({ type, title, firstPage, lastPage }) => ({ type, title, firstPage, lastPage }))).toEqual([
      { type: "peticao-inicial", title: "Petição inicial", firstPage: 1, lastPage: 2 },
      { type: "contestacao", title: "Contestação", firstPage: 3, lastPage: 4 },
      { type: "sentenca", title: "Sentença", firstPage: 5, lastPage: 5 },
    ]);
  });
});

describe("FakeCitingModel", () => {
  citingModelContract(async () => ({ model: new FakeCitingModel() }));

  it("cites the first two sources by default, adds an uncited line, and reports usage last", async () => {
    const events = [];
    for await (const event of new FakeCitingModel().answer({
      instructions: "",
      question: "Qual a decisão?",
      sources: [
        { id: "p12", title: "Página 12", text: "Julgo procedente." },
        { id: "p13", title: "Página 13", text: "Custas pelo réu." },
        { id: "p14", title: "Página 14", text: "Publique-se." },
      ],
      cacheSources: false,
    })) {
      events.push(event);
    }
    expect(events.slice(0, 3)).toEqual([
      { type: "text", text: "Afirmação 1 de exemplo, de Página 12.\n", sourceIds: ["p12"] },
      { type: "text", text: "Afirmação 2 de exemplo, de Página 13.\n", sourceIds: ["p13"] },
      { type: "text", text: "Afirmação de exemplo sem citação.\n", sourceIds: [] },
    ]);
    expect(events.at(-1)?.type).toBe("usage");
  });
});

describe("InMemoryMailer", () => {
  it("keeps every email and logs only sign-in links", async () => {
    const lines: string[] = [];
    const mailer = new InMemoryMailer((line) => lines.push(line));

    await mailer.send({ template: "sign-in", to: "ana@example.com", data: { url: "http://localhost/verify?token=abc" } });
    await mailer.send({ template: "ingestion-failed", to: "ana@example.com", data: { caseFileName: "Autos.pdf", reason: "x" } });

    expect(mailer.outbox.map((email) => email.template)).toEqual(["sign-in", "ingestion-failed"]);
    expect(lines).toEqual(["Sign-in link for ana@example.com: http://localhost/verify?token=abc"]);
  });
});
