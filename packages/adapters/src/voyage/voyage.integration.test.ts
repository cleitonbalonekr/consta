import { embedderContract } from "@consta/core/contracts";
import { describe } from "vitest";
import { VoyageEmbedder } from "./index";

// Calls Voyage and costs money, so it runs only with VOYAGE_API_KEY set: by hand, or in a nightly run.
const apiKey = process.env.VOYAGE_API_KEY;

describe.skipIf(!apiKey)("VoyageEmbedder against Voyage", () => {
  embedderContract(async () => ({ embedder: new VoyageEmbedder({ apiKey: apiKey!, model: "voyage-4-lite", dimensions: 1024 }) }));
});
