import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { AnsweringRepository, QuestionRecord, RankedPassages } from "../../answering";
import type { CaseFileId, LawyerId } from "../../shared";
import type { Db } from "../index";
import * as schema from "../schema";

const { caseFile, page, passage, question } = schema;

type Ranking = "vector" | "text";

export class DrizzleAnsweringRepository implements AnsweringRepository {
  constructor(private readonly db: Db) {}

  async caseFileStatus(lawyer: LawyerId, caseFileId: CaseFileId) {
    const [row] = await this.db
      .select({ status: caseFile.status })
      .from(caseFile)
      .where(and(eq(caseFile.id, caseFileId), eq(caseFile.lawyerId, lawyer)));
    return row?.status ?? null;
  }

  /**
   * One statement: two ranked CTEs, and their rows with the passage and page each names.
   * Iterative index scans (pgvector 0.8) keep the HNSW index from returning fewer than
   * `depth` rows once the case-file filter removes other case files' passages. They run in
   * strict order, because the vector rank and the LIMIT trust the index's order. SET LOCAL
   * lasts until the run ends.
   */
  async search(caseFileId: CaseFileId, { text, embedding }: { text: string; embedding: number[] }, depth: number): Promise<RankedPassages> {
    await this.db.execute(sql`SET LOCAL hnsw.iterative_scan = strict_order`);
    const ofCaseFile = eq(passage.caseFileId, caseFileId);
    const distance = sql`${passage.embedding} <=> ${JSON.stringify(embedding)}::halfvec`;
    // Any word of the question may match: the plain query joins the words with AND, so make it OR.
    const words = sql`replace(plainto_tsquery('portuguese', ${text})::text, '&', '|')::tsquery`;
    const textRank = sql`ts_rank_cd(${passage.tsv}, ${words})`;

    const vector = this.db.$with("vector").as(
      this.db
        .select({ id: passage.id, rank: sql<number>`row_number() over (order by ${distance})`.as("rank") })
        .from(passage)
        .where(ofCaseFile)
        .orderBy(distance)
        .limit(depth),
    );
    const fullText = this.db.$with("full_text").as(
      this.db
        .select({ id: passage.id, rank: sql<number>`row_number() over (order by ${textRank} desc)`.as("rank") })
        .from(passage)
        .where(and(ofCaseFile, sql`${passage.tsv} @@ ${words}`))
        .orderBy(desc(textRank))
        .limit(depth),
    );
    const ranks = this.db.$with("ranks").as(
      this.db
        .select({ id: vector.id, rank: vector.rank, ranking: sql<Ranking>`'vector'`.as("ranking") })
        .from(vector)
        .unionAll(this.db.select({ id: fullText.id, rank: fullText.rank, ranking: sql<Ranking>`'text'`.as("ranking") }).from(fullText)),
    );

    const rows = await this.db
      .with(vector, fullText, ranks)
      .select({
        ranking: ranks.ranking,
        id: passage.id,
        page: passage.page,
        text: passage.text,
        blockIndexes: passage.blockIndexes,
        folha: page.folha,
        blocks: page.blocks,
      })
      .from(ranks)
      .innerJoin(passage, eq(passage.id, ranks.id))
      .innerJoin(page, and(eq(page.caseFileId, passage.caseFileId), eq(page.number, passage.page)))
      .orderBy(asc(ranks.rank));
    const found = (ranking: Ranking) =>
      rows.filter((row) => row.ranking === ranking).map(({ blockIndexes, blocks, ranking: _, ...row }) => ({ ...row, boxes: blockIndexes.flatMap((index) => blocks[index]?.box ?? []) }));
    return { byVector: found("vector"), byText: found("text") };
  }

  async saveQuestion({ id, caseFileId, lawyer, scope, text, answer, dropped }: QuestionRecord) {
    await this.db.insert(question).values({ id, caseFileId, lawyerId: lawyer, scope, text, answer, droppedStatements: dropped });
  }
}
