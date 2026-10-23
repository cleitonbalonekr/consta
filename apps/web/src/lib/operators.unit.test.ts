import { describe, expect, it } from "vitest";
import { isOperator } from "./operators";

describe("isOperator", () => {
  it("accepts an email in the comma-separated list, whatever its case and spacing", () => {
    expect(isOperator("Ana@Example.com", " ana@example.com , bia@example.com")).toBe(true);
    expect(isOperator("bia@example.com", "ana@example.com,bia@example.com")).toBe(true);
  });

  it("refuses an email not in the list", () => {
    expect(isOperator("carla@example.com", "ana@example.com")).toBe(false);
  });

  it("refuses everyone when no operator is configured", () => {
    expect(isOperator("ana@example.com", undefined)).toBe(false);
    expect(isOperator("", "")).toBe(false);
    expect(isOperator("", " , ")).toBe(false);
  });
});
