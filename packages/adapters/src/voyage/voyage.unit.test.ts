import { afterEach, describe, expect, it, vi } from "vitest";
import { VoyageEmbedder } from "./index";

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Answers like Voyage: one vector per input, listed out of order, and the tokens used. */
function stubFetch(status = 200) {
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    const { input } = JSON.parse(String(init.body)) as { input: string[] };
    const data = input.map((text, index) => ({ object: "embedding", embedding: [text.length, index], index })).reverse();
    return new Response(JSON.stringify({ object: "list", data, model: "voyage-4-lite", usage: { total_tokens: 10 * input.length } }), { status });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const embedder = () => new VoyageEmbedder({ apiKey: "pa-test", model: "voyage-4-lite", dimensions: 1024 });

describe("VoyageEmbedder", () => {
  it("embeds passages as documents and questions as queries, at the configured dimensions", async () => {
    const fetch = stubFetch();

    await embedder().embed(["Julgo procedente o pedido."], "passage");
    await embedder().embed(["O que a sentença decidiu?"], "question");

    const [url, passage] = fetch.mock.calls[0]!;
    const [, question] = fetch.mock.calls[1]!;
    expect(url).toBe("https://api.voyageai.com/v1/embeddings");
    expect(new Headers(passage.headers).get("Authorization")).toBe("Bearer pa-test");
    expect(JSON.parse(String(passage.body))).toEqual({
      input: ["Julgo procedente o pedido."],
      model: "voyage-4-lite",
      input_type: "document",
      output_dimension: 1024,
    });
    expect(JSON.parse(String(question.body))).toMatchObject({ input_type: "query" });
  });

  it("returns the vectors in the order of the texts, across requests of 128 texts", async () => {
    const fetch = stubFetch();
    const texts = Array.from({ length: 130 }, (_, i) => "x".repeat(i + 1));

    const { vectors, usage } = await embedder().embed(texts, "passage");

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vectors.map(([length]) => length)).toEqual(texts.map((text) => text.length));
    expect(usage).toEqual([
      { kind: "embed", provider: "voyage", model: "voyage-4-lite", units: 1_280, unit: "token", costUsd: expect.closeTo(0.0000256, 12) },
      { kind: "embed", provider: "voyage", model: "voyage-4-lite", units: 20, unit: "token", costUsd: expect.closeTo(0.0000004, 12) },
    ]);
  });

  it("fails with the status only when Voyage refuses the request", async () => {
    stubFetch(429);

    await expect(embedder().embed(["Texto dos autos."], "passage")).rejects.toThrow("Voyage refused 1 texts with status 429.");
  });
});
