import { citingModelContract } from "@consta/core/contracts";
import { describe } from "vitest";
import { ClaudeCitingModel } from "./index";

// Calls Claude and costs money, so it runs only with ANTHROPIC_API_KEY set: by hand, or in a nightly run.
const apiKey = process.env.ANTHROPIC_API_KEY;

describe.skipIf(!apiKey)("ClaudeCitingModel against Claude", () => {
  citingModelContract(async () => ({ model: new ClaudeCitingModel({ apiKey: apiKey!, model: "claude-sonnet-5-5" }) }));
});
