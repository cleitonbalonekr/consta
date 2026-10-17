import { describe, expect, it } from "vitest";
import { DomainError, InvalidFileSize, InvalidPageCount } from "../shared";
import { FileSize, MAX_BYTES, PageCount } from "./index";

describe("PageCount", () => {
  it.each([1, 10, 5_000])("accepts %i pages", (pages) => {
    expect(PageCount.from(pages).value).toBe(pages);
  });

  it.each([0, -1, 5_001, 2.5, Number.NaN])("refuses %d pages with InvalidPageCount", (pages) => {
    expect(() => PageCount.from(pages)).toThrow(InvalidPageCount);
    expect(() => PageCount.from(pages)).toThrow(DomainError);
  });
});

describe("FileSize", () => {
  it.each([1, 2_048, MAX_BYTES])("accepts %i bytes", (bytes) => {
    expect(FileSize.from(bytes).bytes).toBe(bytes);
  });

  it.each([0, -1, MAX_BYTES + 1, 1.5])("refuses %d bytes with InvalidFileSize", (bytes) => {
    expect(() => FileSize.from(bytes)).toThrow(InvalidFileSize);
    expect(() => FileSize.from(bytes)).toThrow(DomainError);
  });
});
