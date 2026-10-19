import { InvalidFileSize, InvalidPageCount } from "../shared";

/** prd-mvp.md: the pilot takes case files of up to 5,000 pages and 500 MB. */
export const MAX_PAGES = 5_000;
export const MAX_BYTES = 500 * 1024 * 1024;

/** The number of pages in an uploaded case file: 1 to 5,000. */
export class PageCount {
  private constructor(readonly value: number) {}

  /** Throws InvalidPageCount for a count that is not a whole number from 1 to 5,000. */
  static from(pages: number): PageCount {
    if (!Number.isInteger(pages) || pages < 1 || pages > MAX_PAGES) throw new InvalidPageCount(pages);
    return new PageCount(pages);
  }
}

/** The size of an uploaded case file: 1 byte to 500 MB. */
export class FileSize {
  private constructor(readonly bytes: number) {}

  /** Throws InvalidFileSize for a size that is not a whole number from 1 to 500 MB. */
  static from(bytes: number): FileSize {
    if (!Number.isInteger(bytes) || bytes < 1 || bytes > MAX_BYTES) throw new InvalidFileSize(bytes);
    return new FileSize(bytes);
  }
}
