import { describe, expect, it } from "vitest";
import { DomainError, InvalidPageRange, PageRange } from "./index";

describe("PageRange", () => {
  it("contains its first and last pages and those between, and no other", () => {
    const range = PageRange.from(11, 20);

    expect([10, 11, 15, 20, 21].map((page) => range.contains(page))).toEqual([false, true, true, true, false]);
  });

  it.each([
    [1, 1],
    [1, 100],
    [101, 200],
  ])("accepts pages %i to %i", (first, last) => {
    expect(PageRange.from(first, last)).toMatchObject({ first, last });
  });

  it.each([
    [0, 10],
    [-1, 10],
    [11, 10],
    [1.5, 10],
    [1, 10.5],
  ])("refuses pages %d to %d with InvalidPageRange", (first, last) => {
    expect(() => PageRange.from(first, last)).toThrow(InvalidPageRange);
    expect(() => PageRange.from(first, last)).toThrow(DomainError);
  });
});
