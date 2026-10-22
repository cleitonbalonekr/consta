import type { AnswerEvent } from "@consta/core";
import { QuestionId } from "@consta/core";
import { describe, expect, it } from "vitest";
import { decodeAnswerEvents, encodeAnswerEvents, prepend } from "./answer-stream";

const events: AnswerEvent[] = [
  {
    type: "statement",
    statement: {
      text: "A sentença julgou o pedido procedente.",
      citations: [{ page: 10, folha: "10", quote: "JULGO PROCEDENTE", boxes: [{ x0: 0.1, y0: 0.2, x1: 0.5, y1: 0.25 }] }],
    },
  },
  { type: "done", questionId: QuestionId("q-1"), dropped: 1 },
];

async function* fromArray<T>(items: T[]) {
  yield* items;
}

async function collect(stream: ReadableStream<Uint8Array>) {
  const decoded: AnswerEvent[] = [];
  for await (const event of decodeAnswerEvents(stream)) decoded.push(event);
  return decoded;
}

/** Re-chunks a stream into pieces of `size` bytes, as a network might. */
async function rechunk(stream: ReadableStream<Uint8Array>, size: number) {
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += size) controller.enqueue(bytes.slice(i, i + size));
      controller.close();
    },
  });
}

describe("answer stream", () => {
  it("carries answer events from the server to the browser in order", async () => {
    expect(await collect(encodeAnswerEvents(fromArray(events)))).toEqual(events);
  });

  it("reassembles events split across network chunks, including multi-byte characters", async () => {
    expect(await collect(await rechunk(encodeAnswerEvents(fromArray(events)), 7))).toEqual(events);
  });

  it("fails the stream when answering fails mid-answer", async () => {
    async function* failing(): AsyncIterable<AnswerEvent> {
      yield events[0]!;
      throw new Error("boom");
    }

    await expect(collect(encodeAnswerEvents(failing()))).rejects.toThrow();
  });

  it("stops the answer behind it when the lawyer cancels the stream", async () => {
    let stopped = false;
    async function* answering(): AsyncGenerator<AnswerEvent> {
      try {
        yield* events;
      } finally {
        stopped = true;
      }
    }
    const rest = answering();
    const first = await rest.next();

    const reader = encodeAnswerEvents(prepend(first, rest)).getReader();
    await reader.read();
    await reader.cancel();

    expect(stopped).toBe(true);
  });
});
