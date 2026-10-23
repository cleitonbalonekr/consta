import { and, asc, count, eq, gte, lte, ne, sql } from "drizzle-orm";
import type { IngestionRepository, PageRecord, PassageRecord } from "../../ingestion";
import type { FactDraft, PecaDraft } from "../../ports";
import type { CaseFileId, PageRange } from "../../shared";
import type { Db } from "../index";
import * as schema from "../schema";

const { fact, ingestionRange, page, passage, peca } = schema;

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

  async pageLengths(caseFileId: CaseFileId) {
    const rows = await this.db
      .select({ page: page.number, chars: sql<number>`char_length(${page.text})`.mapWith(Number) })
      .from(page)
      .where(eq(page.caseFileId, caseFileId))
      .orderBy(asc(page.number));
    return rows;
  }

  async pageTexts(caseFileId: CaseFileId, { first, last }: PageRange) {
    return this.db
      .select({ page: page.number, text: page.text, source: page.source })
      .from(page)
      .where(and(eq(page.caseFileId, caseFileId), gte(page.number, first), lte(page.number, last)))
      .orderBy(asc(page.number));
  }

  /** The foreign key from fact to page refuses a fact on a page that is not stored. */
  async replaceDocumentMap(caseFileId: CaseFileId, pecas: PecaDraft[], facts: FactDraft[]) {
    await this.db.delete(peca).where(eq(peca.caseFileId, caseFileId));
    await this.db.delete(fact).where(eq(fact.caseFileId, caseFileId));
    if (pecas.length > 0) await this.db.insert(peca).values(pecas.map((draft) => ({ ...draft, caseFileId })));
    if (facts.length > 0) await this.db.insert(fact).values(facts.map((draft) => ({ ...draft, caseFileId })));
  }

  private isRange(caseFileId: CaseFileId, range: PageRange) {
    return and(eq(ingestionRange.caseFileId, caseFileId), eq(ingestionRange.firstPage, range.first));
  }
}
