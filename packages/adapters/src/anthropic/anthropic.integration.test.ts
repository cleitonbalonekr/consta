import { citingModelContract, mapExtractorContract } from "@consta/core/contracts";
import { describe } from "vitest";
import { ClaudeCitingModel, ClaudeMapExtractor } from "./index";

// Calls Claude and costs money, so it runs only with ANTHROPIC_API_KEY set: by hand, or in a nightly run.
const apiKey = process.env.ANTHROPIC_API_KEY;

describe.skipIf(!apiKey)("ClaudeCitingModel against Claude", () => {
  citingModelContract(async () => ({ model: new ClaudeCitingModel({ apiKey: apiKey!, model: "claude-sonnet-5-5" }) }));
});

describe.skipIf(!apiKey)("ClaudeMapExtractor against Claude", () => {
  mapExtractorContract(async () => ({ extractor: new ClaudeMapExtractor({ apiKey: apiKey!, model: "claude-haiku-5-5" }) }));
});
