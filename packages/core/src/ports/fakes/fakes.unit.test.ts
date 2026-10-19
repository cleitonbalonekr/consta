import { describe, expect, it } from "vitest";
import { embedderContract, fileStoreContract } from "../contracts";
import { FakeCitingModel, FakeEmbedder, InMemoryFileStore, InMemoryMailer } from "./index";

describe("InMemoryFileStore", () => {
  fileStoreContract(async () => {
    const files = new InMemoryFileStore();
    return { files, putPart: (url, bytes) => files.putPart(url, bytes) };
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

describe("FakeCitingModel", () => {
  it("cites the first source by default and reports usage last", async () => {
    const events = [];
    for await (const event of new FakeCitingModel().answer({
      instructions: "",
      question: "Qual a decisão?",
      sources: [{ id: "p12", title: "Página 12", text: "Julgo procedente." }],
      cacheSources: false,
    })) {
      events.push(event);
    }
    expect(events[0]).toEqual({ type: "text", text: "Resposta falsa.", sourceIds: ["p12"] });
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
