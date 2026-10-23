import { CaseFileId, PecaId } from "@consta/core";
import { describe, expect, it } from "vitest";
import { parseQuestionRequest } from "./question-request";

const caseFileId = CaseFileId("case-file-1");
const pecaId = "0b6f1f0e-6a4b-4d43-9a63-2f1d8f0c9a11";

describe("parseQuestionRequest", () => {
  it("reads a whole-file question", () => {
    expect(parseQuestionRequest(caseFileId, { scope: { kind: "whole-file" }, text: "  Quem é o autor? " })).toEqual({
      caseFileId,
      scope: { kind: "whole-file" },
      text: "Quem é o autor?",
    });
  });

  it("reads a question about one peça", () => {
    expect(parseQuestionRequest(caseFileId, { scope: { kind: "peca", pecaId }, text: "Resuma." })).toEqual({
      caseFileId,
      scope: { kind: "peca", pecaId: PecaId(pecaId) },
      text: "Resuma.",
    });
  });

  it("reads the summary of one peça", () => {
    expect(parseQuestionRequest(caseFileId, { summarize: pecaId })).toEqual({ caseFileId, summarize: PecaId(pecaId) });
  });

  it("reads a quick action", () => {
    expect(parseQuestionRequest(caseFileId, { quickAction: "amounts" })).toEqual({ caseFileId, quickAction: "amounts" });
  });

  it.each([
    ["no body", null],
    ["an empty question", { scope: { kind: "whole-file" }, text: "   " }],
    ["an unknown scope", { scope: { kind: "everything" }, text: "?" }],
    ["a peça scope without a peça", { scope: { kind: "peca" }, text: "?" }],
    ["an unknown quick action", { quickAction: "witnesses" }],
    ["a summary without a peça", { summarize: "" }],
    ["a summary of a peça id that is not a UUID", { summarize: "p-1" }],
    ["a peça scope whose id is not a UUID", { scope: { kind: "peca", pecaId: "p-1" }, text: "?" }],
    ["a question too long to be one", { scope: { kind: "whole-file" }, text: "a".repeat(2_001) }],
  ])("rejects %s", (_, body) => {
    expect(parseQuestionRequest(caseFileId, body)).toBeNull();
  });
});
