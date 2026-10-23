import { describe, expect, it } from "vitest";
import { CalendarDate, DomainError, InvalidPageRange, PageRange } from "./index";

describe("CalendarDate", () => {
  it("parses a YYYY-MM-DD day of the calendar", () => {
    expect(CalendarDate.parse("2026-02-28")?.iso).toBe("2026-02-28");
    expect(CalendarDate.parse("2024-02-29")?.iso).toBe("2024-02-29");
  });

  it.each(["2026-02-30", "2023-05-00", "2024-13-01", "2026-00-10", "4 de maio de 2026", "2026-5-4", ""])("gives no date for %j", (text) => {
    expect(CalendarDate.parse(text)).toBeNull();
  });
});

describe("PageRange", () => {
  it("groups pages in order into the fewest ranges", () => {
    expect(PageRange.group([3, 4, 5, 9, 11, 12]).map(({ first, last }) => [first, last])).toEqual([
      [3, 5],
      [9, 9],
      [11, 12],
    ]);
    expect(PageRange.group([])).toEqual([]);
  });

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
