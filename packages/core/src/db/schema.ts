import { sql } from "drizzle-orm";
import {
  customType,
  date,
  halfvec,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { caseFileStatuses, factKinds, pecaTypes, plans } from "../shared/values";
import type { Box } from "../shared/values";

/** Dimensions of the passage embeddings. Changing it needs a re-embed of every passage. */
export const EMBEDDING_DIMENSIONS = 1024;

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const caseFileStatus = pgEnum("case_file_status", caseFileStatuses);
export const pageSource = pgEnum("page_source", ["digital", "scanned"]);
export const pecaType = pgEnum("peca_type", pecaTypes);
export const factKind = pgEnum("fact_kind", factKinds);
export const plan = pgEnum("plan", plans);
export const usageKind = pgEnum("usage_kind", ["ocr", "embed", "rerank", "extract", "answer"]);

/** Lawyer ids are Better Auth user ids. */
export const lawyerPlan = pgTable("lawyer_plan", {
  lawyerId: text("lawyer_id").primaryKey(),
  plan: plan("plan").notNull().default("trial"),
  pageQuota: integer("page_quota").notNull(),
  createdAt: createdAt(),
});

export const caseFile = pgTable(
  "case_file",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lawyerId: text("lawyer_id").notNull(),
    name: text("name").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    uploadId: text("upload_id"),
    sizeBytes: integer("size_bytes").notNull(),
    pageCount: integer("page_count").notNull(),
    status: caseFileStatus("status").notNull().default("uploading"),
    pagesDone: integer("pages_done").notNull().default(0),
    error: text("error"),
    createdAt: createdAt(),
    readyAt: timestamp("ready_at", { withTimezone: true }),
  },
  (t) => [index("case_file_lawyer_idx").on(t.lawyerId, t.createdAt)],
);

/** One row per page range that a task ingests. */
export const ingestionRange = pgTable(
  "ingestion_range",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseFileId: uuid("case_file_id").notNull().references(() => caseFile.id, { onDelete: "cascade" }),
    firstPage: integer("first_page").notNull(),
    lastPage: integer("last_page").notNull(),
    status: text("status", { enum: ["pending", "running", "done", "failed"] }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("ingestion_range_case_file_first_page_idx").on(t.caseFileId, t.firstPage)],
);

export const page = pgTable(
  "page",
  {
    caseFileId: uuid("case_file_id").notNull().references(() => caseFile.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    /** The court-stamped "fls." number, when ingestion finds one. */
    folha: text("folha"),
    source: pageSource("source").notNull(),
    text: text("text").notNull(),
    blocks: jsonb("blocks").$type<Array<{ text: string; box: Box }>>().notNull(),
    ocrConfidence: real("ocr_confidence"),
  },
  (t) => [uniqueIndex("page_case_file_number_idx").on(t.caseFileId, t.number)],
);

/** The unit of search. A passage never crosses a page break. */
export const passage = pgTable(
  "passage",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseFileId: uuid("case_file_id").notNull().references(() => caseFile.id, { onDelete: "cascade" }),
    page: integer("page").notNull(),
    text: text("text").notNull(),
    tsv: tsvector("tsv")
      .notNull()
      .generatedAlwaysAs(sql`to_tsvector('portuguese', "text")`),
    embedding: halfvec("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    embeddingModel: text("embedding_model").notNull(),
    /** Indexes into the page's `blocks`, used to mark the passage in the viewer. */
    blockIndexes: integer("block_indexes").array().notNull(),
  },
  (t) => [
    index("passage_case_file_page_idx").on(t.caseFileId, t.page),
    index("passage_tsv_idx").using("gin", t.tsv),
    index("passage_embedding_idx").using("hnsw", t.embedding.op("halfvec_cosine_ops")),
  ],
);

export const peca = pgTable(
  "peca",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseFileId: uuid("case_file_id").notNull().references(() => caseFile.id, { onDelete: "cascade" }),
    type: pecaType("type").notNull(),
    title: text("title").notNull(),
    date: date("date"),
    firstPage: integer("first_page").notNull(),
    lastPage: integer("last_page").notNull(),
    summary: text("summary").notNull(),
  },
  (t) => [index("peca_case_file_first_page_idx").on(t.caseFileId, t.firstPage)],
);

export const fact = pgTable(
  "fact",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseFileId: uuid("case_file_id").notNull().references(() => caseFile.id, { onDelete: "cascade" }),
    kind: factKind("kind").notNull(),
    value: text("value").notNull(),
    normalizedValue: text("normalized_value"),
    context: text("context").notNull(),
    page: integer("page").notNull(),
  },
  (t) => [index("fact_case_file_kind_idx").on(t.caseFileId, t.kind)],
);

export const question = pgTable(
  "question",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseFileId: uuid("case_file_id").notNull().references(() => caseFile.id, { onDelete: "cascade" }),
    lawyerId: text("lawyer_id").notNull(),
    /** "whole-file", "peca" or a quick action. */
    scope: text("scope").notNull(),
    pecaId: uuid("peca_id").references(() => peca.id, { onDelete: "set null" }),
    text: text("text").notNull(),
    answer: jsonb("answer").notNull(),
    droppedStatements: integer("dropped_statements").notNull().default(0),
    feedback: jsonb("feedback"),
    createdAt: createdAt(),
  },
  (t) => [index("question_case_file_idx").on(t.caseFileId, t.createdAt)],
);

/**
 * One row per paid provider call. Holds no case-file content, so it outlives
 * a deleted case file (the reference is set to null).
 */
export const usageEvent = pgTable(
  "usage_event",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lawyerId: text("lawyer_id").notNull(),
    caseFileId: uuid("case_file_id").references(() => caseFile.id, { onDelete: "set null" }),
    kind: usageKind("kind").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    units: integer("units").notNull(),
    unit: text("unit", { enum: ["page", "token"] }).notNull(),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("usage_event_lawyer_created_idx").on(t.lawyerId, t.createdAt)],
);

/** Pages counted against the page quota. Never decreases when a case file is deleted. */
export const quotaCharge = pgTable(
  "quota_charge",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lawyerId: text("lawyer_id").notNull(),
    caseFileId: uuid("case_file_id"),
    pages: integer("pages").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("quota_charge_lawyer_created_idx").on(t.lawyerId, t.createdAt)],
);
