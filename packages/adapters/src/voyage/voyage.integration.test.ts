import { embedderContract, rerankerContract } from "@consta/core/contracts";
import { describe, expect, it } from "vitest";
import { VoyageEmbedder, VoyageReranker } from "./index";

// Calls Voyage and costs money, so it runs only with VOYAGE_API_KEY set: by hand, or in a nightly run.
const apiKey = process.env.VOYAGE_API_KEY;

describe.skipIf(!apiKey)("VoyageEmbedder against Voyage", () => {
  embedderContract(async () => ({ embedder: new VoyageEmbedder({ apiKey: apiKey!, model: "voyage-4-lite", dimensions: 1024 }) }));
});

describe.skipIf(!apiKey)("VoyageReranker against Voyage", () => {
  const reranker = () => new VoyageReranker({ apiKey: apiKey!, model: "rerank-3-lite" });
  rerankerContract(async () => ({ reranker: reranker() }));

  it("puts the passage that answers the question first", async () => {
    const passages = ["Procuração ad judicia.", "O laudo pericial avaliou o imóvel em duzentos mil reais.", "Despacho: cite-se o réu."];

    const { order } = await reranker().rerank("Qual o valor do imóvel segundo o laudo?", passages, 3);

    expect(order[0]).toBe(1);
  });
});
