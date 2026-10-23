import { PecaId } from "@consta/core";
import type { CaseFileId, QuestionInput, QuickAction, Scope } from "@consta/core";

/** What the browser posts to ask a question: a question in a scope, the summary of a peça, or a quick action. */
export type QuestionRequest = { scope: Scope; text: string } | { summarize: PecaId } | { quickAction: QuickAction };

const QUICK_ACTIONS: readonly string[] = ["timeline", "people", "amounts"] satisfies QuickAction[];
const MAX_QUESTION_LENGTH = 2_000;

/** Validates a posted question. Returns null when the body isn't one. */
export function parseQuestionRequest(caseFileId: CaseFileId, body: unknown): QuestionInput | null {
  if (!isRecord(body)) return null;
  if ("summarize" in body) {
    const pecaId = parsePecaId(body.summarize);
    return pecaId ? { caseFileId, summarize: pecaId } : null;
  }
  if ("quickAction" in body) {
    // includes() checks the value at runtime but doesn't narrow it, hence the casts.
    return QUICK_ACTIONS.includes(body.quickAction as string) ? { caseFileId, quickAction: body.quickAction as QuickAction } : null;
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const scope = parseScope(body.scope);
  if (!text || text.length > MAX_QUESTION_LENGTH || !scope) return null;
  return { caseFileId, scope, text };
}

function parseScope(scope: unknown): Scope | null {
  if (!isRecord(scope)) return null;
  if (scope.kind === "whole-file") return { kind: "whole-file" };
  const pecaId = scope.kind === "peca" ? parsePecaId(scope.pecaId) : null;
  return pecaId ? { kind: "peca", pecaId } : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A peça id is a UUID; anything else would fail in Postgres instead of being not found. */
function parsePecaId(value: unknown): PecaId | null {
  return typeof value === "string" && UUID.test(value) ? PecaId(value) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
