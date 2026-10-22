import type { CitingModelEvent, Source } from "@consta/core/ports";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClaudeCitingModel } from "./index";

afterEach(() => {
  vi.unstubAllGlobals();
});

const SOURCES: Source[] = [
  { id: "passage-a", title: "Página 12 (fls. 13)", text: "JULGO PROCEDENTE o pedido." },
  { id: "passage-b", title: "Página 40", text: "O laudo avaliou o imóvel." },
];

const citation = (documentIndex: number) => ({
  type: "content_block_location",
  cited_text: SOURCES[documentIndex]!.text,
  document_index: documentIndex,
  document_title: SOURCES[documentIndex]!.title,
  start_block_index: 0,
  end_block_index: 1,
});

/** A streamed reply as the Messages API sends it: an uncited text block, then a block that cites both sources. */
function replyEvents(stopReason = "end_turn", model = "claude-sonnet-5-5") {
  const usage = { input_tokens: 1_000, output_tokens: 100, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
  return [
    { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model, content: [], stop_reason: null, stop_sequence: null, usage: { ...usage, output_tokens: 1 } } },
    { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "", signature: "" } },
    { type: "content_block_stop", index: 0 },
    { type: "content_block_start", index: 1, content_block: { type: "text", text: "", citations: null } },
    { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Segundo os autos:\n" } },
    { type: "content_block_stop", index: 1 },
    { type: "content_block_start", index: 2, content_block: { type: "text", text: "", citations: null } },
    { type: "content_block_delta", index: 2, delta: { type: "citations_delta", citation: citation(0) } },
    { type: "content_block_delta", index: 2, delta: { type: "citations_delta", citation: citation(1) } },
    { type: "content_block_delta", index: 2, delta: { type: "text_delta", text: "O pedido foi julgado " } },
    { type: "content_block_delta", index: 2, delta: { type: "text_delta", text: "procedente." } },
    { type: "content_block_stop", index: 2 },
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

async function answer(cacheSources = false) {
  const model = new ClaudeCitingModel({ apiKey: "sk-ant-test", model: "claude-sonnet-5-5" });
  const events: CitingModelEvent[] = [];
  for await (const event of model.answer({ instructions: "Responda.", sources: SOURCES, question: "O que decidiu?", cacheSources })) events.push(event);
  return events;
}

describe("ClaudeCitingModel", () => {
  it("sends each source as a titled document with citations on, then the question, with the fallback on", async () => {
    const fetch = stubFetch(replyEvents());

    await answer();

    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe("https://api.anthropic.com/v1/messages?beta=true");
    expect(new Headers(init!.headers).get("anthropic-beta")).toBe("server-side-fallback-2026-07-01");
    const body = JSON.parse(String(init!.body));
    expect(body).toMatchObject({ model: "claude-sonnet-5-5", max_tokens: 4_000, system: "Responda.", fallbacks: "default", stream: true });
    expect(body.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "document", source: { type: "content", content: [{ type: "text", text: SOURCES[0]!.text }] }, title: "Página 12 (fls. 13)", citations: { enabled: true } },
          { type: "document", source: { type: "content", content: [{ type: "text", text: SOURCES[1]!.text }] }, title: "Página 40", citations: { enabled: true } },
          { type: "text", text: "O que decidiu?" },
        ],
      },
    ]);
  });

  it("marks the last document for caching when asked", async () => {
    const fetch = stubFetch(replyEvents());

    await answer(true);

    const { messages } = JSON.parse(String(fetch.mock.calls[0]![1]!.body));
    expect(messages[0].content.map((block: { cache_control?: unknown }) => block.cache_control)).toEqual([undefined, { type: "ephemeral" }, undefined]);
  });

  it("turns each text block into a text event with the ids its citations name, and ends with the usage", async () => {
    stubFetch(replyEvents());

    const events = await answer();

    expect(events).toEqual([
      { type: "text", text: "Segundo os autos:\n", sourceIds: [] },
      { type: "text", text: "O pedido foi julgado procedente.", sourceIds: ["passage-a", "passage-b"] },
      { type: "usage", usage: { kind: "answer", provider: "anthropic", model: "claude-sonnet-5-5", units: 1_100, unit: "token", costUsd: expect.closeTo(0.003, 12) } },
    ]);
  });

  it("ends with declined, after the usage, when the reply ends in a refusal", async () => {
    stubFetch(replyEvents("refusal"));

    const events = await answer();

    expect(events.slice(-2).map((event) => event.type)).toEqual(["usage", "declined"]);
  });

  it("prices the usage at the rate of the model that answered, when the fallback answers", async () => {
    stubFetch(replyEvents("end_turn", "claude-opus-4-8"));

    const events = await answer();

    expect(events.at(-1)).toEqual({ type: "usage", usage: expect.objectContaining({ model: "claude-opus-4-8", costUsd: expect.closeTo(0.0075, 12) }) });
  });

  it("throws for a model it has no price for, rather than metering it as free", async () => {
    stubFetch(replyEvents("end_turn", "claude-unknown-1"));

    await expect(answer()).rejects.toThrow("No price for the Claude model claude-unknown-1");
    expect(() => new ClaudeCitingModel({ apiKey: "sk-ant-test", model: "claude-unknown-1" })).toThrow("No price");
  });
});
