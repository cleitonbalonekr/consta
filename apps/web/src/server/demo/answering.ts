import { NotFound, QuestionId } from "@consta/core";
import type { Answering, LawyerId, QuestionInput, Statement } from "@consta/core";
import { ingestionProgress } from "./progress";
import type { DemoScript, DraftStatement } from "./script";
import type { DemoStore } from "./store";

type DemoAnsweringDeps = { store: DemoStore; now: () => number; pause: () => Promise<void> };

/** Answering that plays back each case file's script, one statement at a time. */
export function createDemoAnswering({ store, now, pause }: DemoAnsweringDeps): Answering {
  return {
    async *ask(lawyer: LawyerId, question: QuestionInput) {
      const file = store.get(question.caseFileId);
      if (!file || file.lawyer !== lawyer) throw new NotFound(`Case file ${question.caseFileId} not found.`);
      if (ingestionProgress(file, now()).status !== "ready") {
        yield { type: "refused", reason: "not-ready" };
        return;
      }

      let dropped = 0;
      for (const draft of scriptedAnswer(file.script, question)) {
        await pause();
        if (!isCited(draft)) {
          dropped++;
          continue;
        }
        yield { type: "statement", statement: draft };
      }
      yield { type: "done", questionId: QuestionId(crypto.randomUUID()), dropped };
    },
  };
}

function scriptedAnswer(script: DemoScript, question: QuestionInput): DraftStatement[] {
  if ("quickAction" in question) return script.quickActions[question.quickAction];
  if (question.scope.kind === "whole-file") return script.wholeFile;

  const answer = script.byPeca.get(question.scope.pecaId);
  if (!answer) throw new NotFound(`Peça ${question.scope.pecaId} not found.`);
  return answer;
}

/** A statement reaches the lawyer only with a citation (ADR-0003). */
function isCited(draft: DraftStatement): draft is Statement {
  return draft.citations.length > 0;
}
