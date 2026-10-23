import { CaseFileId, PecaId } from "@consta/core";
import { describe, expect, it } from "vitest";
import { parseQuestionRequest } from "./question-request";

const caseFileId = CaseFileId("case-file-1");

describe("parseQuestionRequest", () => {
  it("reads a whole-file question", () => {
    expect(parseQuestionRequest(caseFileId, { scope: { kind: "whole-file" }, text: "  Quem é o autor? " })).toEqual({
      caseFileId,
      scope: { kind: "whole-file" },
      text: "Quem é o autor?",
    });
  });

  it("reads a question about one peça", () => {
    expect(parseQuestionRequest(caseFileId, { scope: { kind: "peca", pecaId: "p-1" }, text: "Resuma." })).toEqual({
      caseFileId,
      scope: { kind: "peca", pecaId: PecaId("p-1") },
      text: "Resuma.",
    });
  });

  it("reads the summary of one peça", () => {
    expect(parseQuestionRequest(caseFileId, { summarize: "p-1" })).toEqual({ caseFileId, summarize: PecaId("p-1") });
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
    ["a question too long to be one", { scope: { kind: "whole-file" }, text: "a".repeat(2_001) }],
  ])("rejects %s", (_, body) => {
    expect(parseQuestionRequest(caseFileId, body)).toBeNull();
  });
});
