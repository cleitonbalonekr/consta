import type { PageText, PecaDraft } from "@consta/core/ports";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClaudeMapExtractor } from "./index";

afterEach(() => {
  vi.unstubAllGlobals();
});

const PAGES: PageText[] = [
  { page: 11, text: "SENTENÇA. Ante o exposto, JULGO PROCEDENTE o pedido.", source: "digital" },
  { page: 12, text: "", source: "scanned" },
  { page: 13, text: "", source: "digital" },
];

const OPEN_PECA: PecaDraft = {
  type: "contestacao",
  title: "Contestação",
  date: "2026-04-01",
  firstPage: 7,
  lastPage: 10,
  summary: "O réu nega a dívida.",
};

const ANSWER = {
  pecas: [
    { type: "sentenca", title: "Sentença", date: "2026-05-04", firstPage: 11, lastPage: 12, summary: "Julga o pedido procedente." },
    { type: "despacho", title: "Despacho", date: "4 de maio", firstPage: 12, lastPage: 12, summary: "Intime-se." },
    { type: "despacho", title: "Despacho", date: "2026-02-30", firstPage: 12, lastPage: 12, summary: "Cite-se." },
    { type: "despacho", title: "Despacho", date: "2023-05-00", firstPage: 12, lastPage: 12, summary: "Publique-se." },
  ],
  facts: [{ kind: "amount", value: "R$ 10.000,00", normalizedValue: "10000.00", context: "condenação", page: 11 }],
};

/** A streamed reply as the Messages API sends it: thinking, then the JSON answer in one text block. */
function replyEvents({ stopReason = "end_turn", inputTokens = 1_000, text = JSON.stringify(ANSWER) } = {}) {
  const usage = { input_tokens: inputTokens, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  return [
    { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { ...usage, output_tokens: 1 } } },
    { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } },
    { type: "content_block_stop", index: 0 },
    { type: "content_block_start", index: 1, content_block: { type: "text", text: "", citations: null } },
    { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: text.slice(0, 20) } },
    { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: text.slice(20) } },
    { type: "content_block_stop", index: 1 },
    { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage },
    { type: "message_stop" },
  ];
}

function stubFetch(events: object[]) {
  const body = events.map((event) => `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`).join("");
  const fetch = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function sentRequest(fetch: ReturnType<typeof stubFetch>) {
  return JSON.parse(String(fetch.mock.calls[0]![1]!.body));
}

const extractor = () => new ClaudeMapExtractor({ apiKey: "test-key", model: "claude-haiku-5-5" });

describe("ClaudeMapExtractor", () => {
  it("sends the pages, marking a scanned page as not read, and the open peça, and asks for JSON in the schema", async () => {
    const fetch = stubFetch(replyEvents());

    await extractor().extract({ pages: PAGES, openPeca: OPEN_PECA });

    const request = sentRequest(fetch);
    expect(request.model).toBe("claude-haiku-5-5");
    expect(request.output_config.format.type).toBe("json_schema");
    expect(request.output_config.format.schema.required).toEqual(["pecas", "facts"]);
    const prompt = JSON.stringify(request.messages);
    expect(prompt).toContain("JULGO PROCEDENTE");
    expect(prompt).toContain('<page number=\\"12\\" unread=\\"true\\"');
    // A blank digital page was read; it just holds no text.
    expect(prompt).toContain('<page number=\\"13\\">');
    expect(prompt).toContain('\\"firstPage\\":7');
  });

  it("returns the peças and facts, with a date that is not an ISO date or no day of the calendar as no date", async () => {
    stubFetch(replyEvents());

    const { pecas, facts } = await extractor().extract({ pages: PAGES, openPeca: null });

    expect(pecas).toEqual([ANSWER.pecas[0], ...ANSWER.pecas.slice(1).map((peca) => ({ ...peca, date: null }))]);
    expect(facts).toEqual(ANSWER.facts);
  });

  it("prices a window at Claude Haiku 5.5's rate, and at five times it for a prompt over 100,000 tokens", async () => {
    stubFetch(replyEvents());
    const { usage } = await extractor().extract({ pages: PAGES, openPeca: null });

    stubFetch(replyEvents({ inputTokens: 100_001 }));
    const { usage: long } = await extractor().extract({ pages: PAGES, openPeca: null });

    expect(usage).toEqual([{ kind: "extract", provider: "anthropic", model: "claude-haiku-5-5", units: 1_100, unit: "token", costUsd: (1_000 * 0.1 + 100 * 0.5) / 1e6 }]);
    expect(long[0]!.costUsd).toBeCloseTo((100_001 * 0.5 + 100 * 2.5) / 1e6, 12);
  });

  it.each([
    ["refuses", { stopReason: "refusal" }, /declined/],
    ["runs out of tokens", { stopReason: "max_tokens" }, /max_tokens/],
    ["answers with no JSON", { text: "Não sei." }, /JSON/],
  ])("throws when Claude %s, so the map step runs again", async (_case, reply, error) => {
    stubFetch(replyEvents(reply));

    await expect(extractor().extract({ pages: PAGES, openPeca: null })).rejects.toThrow(error);
  });

  it("refuses a model it has no price for", () => {
    expect(() => new ClaudeMapExtractor({ apiKey: "test-key", model: "claude-unknown" })).toThrow("No price");
  });
});
