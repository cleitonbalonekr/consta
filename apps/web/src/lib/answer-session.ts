import type { AnswerEvent, Statement } from "@consta/core";
import { decodeAnswerEvents } from "./answer-stream";

/** The answer on screen, from the question until its stream ends. */
export type AnswerState = {
  question: string;
  /** What the question was about, as the lawyer reads it. */
  scopeLabel: string;
  statements: Statement[];
  state: "streaming" | "done" | "refused" | "error";
  message?: string;
};

const REFUSALS: Record<Extract<AnswerEvent, { type: "refused" }>["reason"], string> = {
  "not-ready": "Estes autos ainda estão sendo lidos. Pergunte de novo quando a leitura terminar.",
  "scope-too-large": "Esta peça é grande demais para uma pergunta só. Escolha uma peça menor.",
  declined: "Não conseguimos responder a esta pergunta. Tente reformulá-la.",
};

const FAILED = "Não conseguimos responder agora. Tente de novo.";

/** The answer before its first event. */
export function startAnswer(question: string, scopeLabel: string): AnswerState {
  return { question, scopeLabel, statements: [], state: "streaming" };
}

/** The answer when it could not be asked or read, keeping what the lawyer already saw. */
export function failAnswer(answer: AnswerState): AnswerState {
  return { ...answer, state: "error", message: FAILED };
}

/**
 * The states of an answer as its stream arrives, one per event, ending with done,
 * refused or error. A stream that breaks, or ends before `done`, ends in error.
 */
export async function* answerStates(start: AnswerState, body: ReadableStream<Uint8Array>): AsyncIterable<AnswerState> {
  let answer = start;
  try {
    for await (const event of decodeAnswerEvents(body)) {
      answer = applyEvent(answer, event);
      yield answer;
      if (answer.state !== "streaming") return;
    }
  } catch {
    yield failAnswer(answer);
    return;
  }
  yield failAnswer(answer);
}

function applyEvent(answer: AnswerState, event: AnswerEvent): AnswerState {
  switch (event.type) {
    case "statement":
      return { ...answer, statements: [...answer.statements, event.statement] };
    case "done":
      return { ...answer, state: "done" };
    case "refused":
      // A declined answer is partial, so what was shown goes.
      return { ...answer, statements: [], state: "refused", message: REFUSALS[event.reason] };
  }
}
