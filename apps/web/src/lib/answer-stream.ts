import type { AnswerEvent } from "@consta/core";

/** The media type of an answer stream: one JSON-encoded AnswerEvent per line. */
export const ANSWER_STREAM_TYPE = "application/x-ndjson";

/** Serializes answer events as they arrive. An error while answering errors the stream. */
export function encodeAnswerEvents(events: AsyncIterable<AnswerEvent>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = events[Symbol.asyncIterator]();
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

/**
 * Yields an event already read, then the rest. Returns `rest` when the consumer stops early,
 * so a lawyer who leaves mid-answer stops the model call.
 */
export async function* prepend<T>(first: IteratorResult<T>, rest: AsyncIterator<T>): AsyncIterable<T> {
  try {
    if (first.done) return;
    yield first.value;
    for (let next = await rest.next(); !next.done; next = await rest.next()) yield next.value;
  } finally {
    await rest.return?.();
  }
}

/** Reads the events of an answer stream, one line at a time, however the network chunks it. */
export async function* decodeAnswerEvents(stream: ReadableStream<Uint8Array>): AsyncIterable<AnswerEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const complete = buffer.split("\n");
    buffer = complete.pop()!;
    for (const line of complete) {
      // Our own route handler wrote this line from an AnswerEvent.
      if (line) yield JSON.parse(line) as AnswerEvent;
    }
  }
  // A stream that ends without a newline still ends with a whole event from our route handler.
  if (buffer) yield JSON.parse(buffer) as AnswerEvent;
}
