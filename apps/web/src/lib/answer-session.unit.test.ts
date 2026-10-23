import type { AnswerEvent, Statement } from "@consta/core";
import { QuestionId } from "@consta/core";
import { describe, expect, it } from "vitest";
import { answerStates, startAnswer } from "./answer-session";
import type { AnswerState } from "./answer-session";
import { encodeAnswerEvents } from "./answer-stream";

const statement = (text: string): Statement => ({ text, citations: [{ page: 1, folha: "2", quote: text, boxes: [] }] });

async function* fromArray(events: AnswerEvent[], thenFail = false): AsyncIterable<AnswerEvent> {
  yield* events;
  if (thenFail) throw new Error("connection lost");
}

async function states(events: AnswerEvent[], thenFail = false) {
  const all: AnswerState[] = [];
  for await (const state of answerStates(startAnswer("O que houve?", "Autos inteiros"), encodeAnswerEvents(fromArray(events, thenFail)))) all.push(state);
  return all;
}

describe("answerStates", () => {
  it("adds each statement as it arrives, and ends done", async () => {
    const all = await states([
      { type: "statement", statement: statement("Primeira.") },
      { type: "statement", statement: statement("Segunda.") },
      { type: "done", questionId: QuestionId("q-1"), dropped: 0, unreadPages: [] },
    ]);

    expect(all.map((state) => [state.state, state.statements.map((shown) => shown.text)])).toEqual([
      ["streaming", ["Primeira."]],
      ["streaming", ["Primeira.", "Segunda."]],
      ["done", ["Primeira.", "Segunda."]],
    ]);
  });

  it("keeps the scanned pages of the peça that the answer could not read", async () => {
    const all = await states([
      { type: "statement", statement: statement("Primeira.") },
      { type: "done", questionId: QuestionId("q-1"), dropped: 0, unreadPages: [{ first: 4, last: 5 }] },
    ]);

    expect(all.at(-1)).toMatchObject({ state: "done", unreadPages: [{ first: 4, last: 5 }] });
  });

  it("says that a peça of scanned pages can't be read", async () => {
    const all = await states([{ type: "refused", reason: "not-readable" }]);

    expect(all.at(-1)).toMatchObject({ state: "refused", message: expect.stringContaining("digitalizadas") });
  });

  it("shows why a question was refused", async () => {
    const all = await states([{ type: "refused", reason: "not-ready" }]);

    expect(all.at(-1)).toMatchObject({ state: "refused", message: expect.stringContaining("ainda estão sendo lidos") });
  });

  it("removes the statements already shown when the model declined part way", async () => {
    const all = await states([
      { type: "statement", statement: statement("Parcial.") },
      { type: "refused", reason: "declined" },
    ]);

    expect(all.at(-1)).toMatchObject({ state: "refused", statements: [], message: expect.stringContaining("Tente reformulá-la") });
  });

  it("ends in error, keeping what was shown, when the stream ends before done", async () => {
    const all = await states([{ type: "statement", statement: statement("Primeira.") }]);

    expect(all.at(-1)).toMatchObject({ state: "error", statements: [statement("Primeira.")], message: expect.any(String) });
  });

  it("ends in error when the stream breaks mid-answer", async () => {
    const all = await states([{ type: "statement", statement: statement("Primeira.") }], true);

    expect(all.at(-1)).toMatchObject({ state: "error", statements: [statement("Primeira.")] });
  });
});
