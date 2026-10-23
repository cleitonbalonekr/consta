import { describe, expect, it } from "vitest";
import { Month } from "./index";

describe("Month", () => {
  it("parses YYYY-MM and refuses anything else", () => {
    expect(Month.parse("2026-10")?.toString()).toBe("2026-10");
    expect(Month.parse("2026-13")).toBeNull();
    expect(Month.parse("2026-00")).toBeNull();
    expect(Month.parse("2026-1")).toBeNull();
    expect(Month.parse("outubro")).toBeNull();
  });

  it("is the month of a moment in São Paulo, not in UTC", () => {
    // 02:00 UTC on 1 October is still 23:00 on 30 September in São Paulo.
    expect(Month.of(new Date("2026-10-01T02:00:00Z")).toString()).toBe("2026-09");
    expect(Month.of(new Date("2026-10-01T03:00:00Z")).toString()).toBe("2026-10");
  });

  it("starts at midnight in São Paulo and ends where the next month starts", () => {
    const october = Month.parse("2026-10")!;

    expect(october.start).toEqual(new Date("2026-10-01T03:00:00Z"));
    expect(october.end).toEqual(new Date("2026-11-01T03:00:00Z"));
  });

  it("steps across a year", () => {
    expect(Month.parse("2026-12")!.next().toString()).toBe("2027-01");
    expect(Month.parse("2027-01")!.previous().toString()).toBe("2026-12");
  });
});
