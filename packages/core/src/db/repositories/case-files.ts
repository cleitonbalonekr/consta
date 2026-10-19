import { and, desc, eq } from "drizzle-orm";
import { CaseFile } from "../../case-files";
import type { CaseFileRepository } from "../../case-files";
import { CaseFileId, LawyerId } from "../../shared";
import type { Db } from "../index";
import * as schema from "../schema";

/** Ids come from URLs. Postgres refuses a malformed uuid, so such an id finds nothing instead. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class DrizzleCaseFileRepository implements CaseFileRepository {
  constructor(private readonly db: Db) {}

  async find(lawyer: LawyerId, id: CaseFileId, options?: { lock: boolean }) {
    if (!UUID.test(id)) return null;
    const query = this.db
      .select()
      .from(schema.caseFile)
      .where(and(eq(schema.caseFile.id, id), eq(schema.caseFile.lawyerId, lawyer)));
    const [row] = options?.lock ? await query.for("update") : await query;
    return row ? toCaseFile(row) : null;
  }

  async listOf(lawyer: LawyerId) {
    const rows = await this.db
      .select()
      .from(schema.caseFile)
      .where(eq(schema.caseFile.lawyerId, lawyer))
      .orderBy(desc(schema.caseFile.createdAt));
    return rows.map(toCaseFile);
  }

  async save(caseFile: CaseFile) {
    const { id, lawyer, ...fields } = caseFile.snapshot();
    const row = { ...fields, lawyerId: lawyer };
    await this.db
      .insert(schema.caseFile)
      .values({ id, ...row })
      .onConflictDoUpdate({ target: schema.caseFile.id, set: row });
  }
}

function toCaseFile({ lawyerId, ...row }: typeof schema.caseFile.$inferSelect): CaseFile {
  return CaseFile.restore({ ...row, id: CaseFileId(row.id), lawyer: LawyerId(lawyerId) });
}
