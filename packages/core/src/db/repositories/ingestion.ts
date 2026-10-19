import { and, asc, count, eq, gte, lte, ne, sql } from "drizzle-orm";
import type { IngestionRepository, PageRecord, PassageRecord } from "../../ingestion";
import type { CaseFileId, PageRange } from "../../shared";
import type { Db } from "../index";
import * as schema from "../schema";

const { ingestionRange, page, passage } = schema;

export class DrizzleIngestionRepository implements IngestionRepository {
  constructor(private readonly db: Db) {}

  async addRanges(caseFileId: CaseFileId, ranges: PageRange[]) {
    if (ranges.length === 0) return;
    await this.db
      .insert(ingestionRange)
      .values(ranges.map(({ first, last }) => ({ caseFileId, firstPage: first, lastPage: last })))
      .onConflictDoNothing({ target: [ingestionRange.caseFileId, ingestionRange.firstPage] });
  }

  async startRange(caseFileId: CaseFileId, range: PageRange) {
    await this.db
      .update(ingestionRange)
      .set({ status: "running", attempts: sql`${ingestionRange.attempts} + 1`, startedAt: new Date(), finishedAt: null })
      .where(this.isRange(caseFileId, range));
  }

  async finishRange(caseFileId: CaseFileId, range: PageRange) {
    await this.db.update(ingestionRange).set({ status: "done", finishedAt: new Date() }).where(this.isRange(caseFileId, range));
  }

  async countUnfinishedRanges(caseFileId: CaseFileId) {
    const [row] = await this.db
      .select({ ranges: count() })
      .from(ingestionRange)
      .where(and(eq(ingestionRange.caseFileId, caseFileId), ne(ingestionRange.status, "done")));
    return row?.ranges ?? 0;
  }

  /** The foreign key from passage to page deletes the pages' passages too. */
  async removePages(caseFileId: CaseFileId, { first, last }: PageRange) {
    await this.db.delete(page).where(and(eq(page.caseFileId, caseFileId), gte(page.number, first), lte(page.number, last)));
  }

  async savePages(caseFileId: CaseFileId, pages: PageRecord[], passages: PassageRecord[]) {
    if (pages.length > 0) await this.db.insert(page).values(pages.map((record) => ({ ...record, caseFileId })));
    if (passages.length > 0) await this.db.insert(passage).values(passages.map((record) => ({ ...record, caseFileId })));
  }

  async countPages(caseFileId: CaseFileId) {
    const [row] = await this.db.select({ pages: count() }).from(page).where(eq(page.caseFileId, caseFileId));
    return row?.pages ?? 0;
  }

  async scannedPages(caseFileId: CaseFileId) {
    const rows = await this.db
      .select({ number: page.number })
      .from(page)
      .where(and(eq(page.caseFileId, caseFileId), eq(page.source, "scanned")))
      .orderBy(asc(page.number));
    return rows.map((row) => row.number);
  }

  private isRange(caseFileId: CaseFileId, range: PageRange) {
    return and(eq(ingestionRange.caseFileId, caseFileId), eq(ingestionRange.firstPage, range.first));
  }
}
