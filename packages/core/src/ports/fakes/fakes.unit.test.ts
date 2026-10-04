import { describe, expect, it } from "vitest";
import { FakeCitingModel, FakeEmbedder, InMemoryFileStore } from "./index";

describe("InMemoryFileStore", () => {
  it("assembles a multipart upload in part order and supports resume", async () => {
    const store = new InMemoryFileStore();
    const { uploadId } = await store.startMultipart("case-files/1.pdf", "application/pdf");

    await store.putPart("case-files/1.pdf", uploadId, 2, new Uint8Array([3, 4]));
    await store.putPart("case-files/1.pdf", uploadId, 1, new Uint8Array([1, 2]));
    const parts = await store.listParts("case-files/1.pdf", uploadId);
    expect(parts.map((part) => part.partNumber)).toEqual([1, 2]);

    await store.completeMultipart("case-files/1.pdf", uploadId, parts);
    expect(await store.read("case-files/1.pdf")).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(await store.read("case-files/1.pdf", { start: 1, end: 3 })).toEqual(new Uint8Array([2, 3]));
  });
});

describe("FakeEmbedder", () => {
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
