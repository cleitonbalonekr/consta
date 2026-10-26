import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { CaseFile } from "../../case-files";
import type { CaseFileRepository, Folhas } from "../../case-files";
import { CaseFileId, LawyerId, PecaId } from "../../shared";
import type { Db } from "../index";
import * as schema from "../schema";

/** Ids come from URLs. Postgres refuses a malformed uuid, so such an id finds nothing instead. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class DrizzleCaseFileRepository implements CaseFileRepository {
  constructor(private readonly db: Db) {}

  find(lawyer: LawyerId, id: CaseFileId, options?: { lock: boolean }) {
    return this.findWhere(id, eq(schema.caseFile.lawyerId, lawyer), options);
  }

  findById(id: CaseFileId, options?: { lock: boolean }) {
    return this.findWhere(id, undefined, options);
  }

  async listOf(lawyer: LawyerId) {
    const rows = await this.db
      .select()
      .from(schema.caseFile)
      .where(eq(schema.caseFile.lawyerId, lawyer))
      .orderBy(desc(schema.caseFile.createdAt));
    return rows.map(toCaseFile);
  }

  async folhasOf(id: CaseFileId) {
    if (!UUID.test(id)) return {};
    const rows = await this.db
      .select({ number: schema.page.number, folha: schema.page.folha })
      .from(schema.page)
      .where(and(eq(schema.page.caseFileId, id), isNotNull(schema.page.folha)));
    const folhas: Folhas = {};
    // The where clause keeps only pages with a folha; the select type can't see it.
    for (const { number, folha } of rows) folhas[number] = folha!;
    return folhas;
  }

  async documentMapOf(id: CaseFileId) {
    if (!UUID.test(id)) return [];
    const { peca } = schema;
    const rows = await this.db
      .select({ id: peca.id, type: peca.type, title: peca.title, date: peca.date, firstPage: peca.firstPage, lastPage: peca.lastPage, summary: peca.summary })
      .from(peca)
      .where(eq(peca.caseFileId, id))
      .orderBy(asc(peca.firstPage));
    return rows.map((row) => ({ ...row, id: PecaId(row.id) }));
  }

  async save(caseFile: CaseFile) {
    const { id, lawyer, ...fields } = caseFile.snapshot();
    const row = { ...fields, lawyerId: lawyer };
    await this.db
      .insert(schema.caseFile)
      .values({ id, ...row })
      .onConflictDoUpdate({ target: schema.caseFile.id, set: row });
  }

  /** The foreign keys cascade to the derived rows and set the usage's case file to null. */
  async remove(id: CaseFileId) {
    if (!UUID.test(id)) return;
    await this.db.delete(schema.caseFile).where(eq(schema.caseFile.id, id));
  }

  private async findWhere(id: CaseFileId, owner: SQL | undefined, options?: { lock: boolean }) {
    if (!UUID.test(id)) return null;
    const query = this.db
      .select()
      .from(schema.caseFile)
      .where(and(eq(schema.caseFile.id, id), owner));
    const [row] = options?.lock ? await query.for("update") : await query;
    return row ? toCaseFile(row) : null;
  }
}

function toCaseFile({ lawyerId, ...row }: typeof schema.caseFile.$inferSelect): CaseFile {
  return CaseFile.restore({ ...row, id: CaseFileId(row.id), lawyer: LawyerId(lawyerId) });
}
