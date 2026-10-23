import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  foreignKey,
  date,
  halfvec,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { caseFileStatuses, factKinds, pecaTypes, plans, quickActions, scopeKinds, usageKinds } from "../shared/values";
import type { Box } from "../shared/values";
import type { Statement } from "../answering";

/** Dimensions of the passage embeddings. Changing it needs a re-embed of every passage. */
export const EMBEDDING_DIMENSIONS = 1024;

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const caseFileStatus = pgEnum("case_file_status", caseFileStatuses);
export const pageSource = pgEnum("page_source", ["digital", "scanned"]);
export const pecaType = pgEnum("peca_type", pecaTypes);
export const factKind = pgEnum("fact_kind", factKinds);
export const plan = pgEnum("plan", plans);
export const questionScope = pgEnum("question_scope", scopeKinds);
export const quickAction = pgEnum("quick_action", quickActions);
export const usageKind = pgEnum("usage_kind", usageKinds);

const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// Better Auth's tables. Their property names are Better Auth's field names, which its
// Drizzle adapter looks up; a lawyer is a `user` row. Don't rename them.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

/** Holds magic-link tokens until they are used or expire. */
export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/**
 * A lawyer's id is their Better Auth user id. A user with case files can't be
 * deleted: CaseFiles.remove must delete them first, stored PDFs included.
 */
const lawyerId = () =>
  text("lawyer_id")
    .notNull()
    .references(() => user.id);

export const lawyerPlan = pgTable("lawyer_plan", {
  lawyerId: text("lawyer_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  plan: plan("plan").notNull().default("trial"),
  pageQuota: integer("page_quota").notNull(),
  /** The payment provider's customer, once the lawyer has paid. */
  billingCustomer: text("billing_customer").unique(),
  /** When the payment provider last changed the plan; an older change is stale. */
  planChangedAt: timestamp("plan_changed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const caseFile = pgTable(
  "case_file",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lawyerId: lawyerId(),
    name: text("name").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    uploadId: text("upload_id"),
    sizeBytes: integer("size_bytes").notNull(),
    pageCount: integer("page_count").notNull(),
    status: caseFileStatus("status").notNull().default("uploading"),
    pagesDone: integer("pages_done").notNull().default(0),
    error: text("error"),
    /** The scanned pages that ingestion did not read (ADR-0010), as ranges. Empty until the case file is ready. */
    unreadPages: jsonb("unread_pages").$type<Array<{ first: number; last: number }>>().notNull().default([]),
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
  (t) => [
    uniqueIndex("ingestion_range_case_file_first_page_idx").on(t.caseFileId, t.firstPage),
    check("ingestion_range_pages_check", sql`${t.firstPage} <= ${t.lastPage}`),
  ],
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
  (t) => [primaryKey({ columns: [t.caseFileId, t.number] })],
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
    // A retried range deletes its pages, and their passages go with them.
    foreignKey({ columns: [t.caseFileId, t.page], foreignColumns: [page.caseFileId, page.number] }).onDelete("cascade"),
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
  (t) => [
    index("peca_case_file_first_page_idx").on(t.caseFileId, t.firstPage),
    check("peca_pages_check", sql`${t.firstPage} <= ${t.lastPage}`),
  ],
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
  (t) => [
    index("fact_case_file_kind_idx").on(t.caseFileId, t.kind),
    // A fact always names a stored page; a range read again deletes its pages' facts with them.
    foreignKey({ columns: [t.caseFileId, t.page], foreignColumns: [page.caseFileId, page.number] }).onDelete("cascade"),
  ],
);

export const question = pgTable(
  "question",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseFileId: uuid("case_file_id").notNull().references(() => caseFile.id, { onDelete: "cascade" }),
    lawyerId: lawyerId(),
    scope: questionScope("scope").notNull(),
    /** Set for a quick action, which is about the whole case file. */
    quickAction: quickAction("quick_action"),
    /** Cascade, not set null: a peça question without its peça would break the scope check. */
    pecaId: uuid("peca_id").references(() => peca.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    answer: jsonb("answer").$type<Statement[]>().notNull(),
    droppedStatements: integer("dropped_statements").notNull().default(0),
    feedback: jsonb("feedback"),
    createdAt: createdAt(),
  },
  (t) => [
    index("question_case_file_idx").on(t.caseFileId, t.createdAt),
    check("question_scope_peca_check", sql`(${t.scope} = 'peca') = (${t.pecaId} IS NOT NULL)`),
  ],
);

/**
 * One row per paid provider call. Holds no case-file content, so it outlives
 * a deleted case file (the reference is set to null). `lawyer_id` has no foreign
 * key on purpose: billing records outlive the lawyer's account too.
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

/**
 * Pages counted against the page quota. Never decreases when a case file is deleted.
 * Like `usage_event`, it has no foreign keys, so it outlives the case file and the account.
 */
export const quotaCharge = pgTable(
  "quota_charge",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lawyerId: text("lawyer_id").notNull(),
    caseFileId: uuid("case_file_id"),
    pages: integer("pages").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index("quota_charge_lawyer_created_idx").on(t.lawyerId, t.createdAt),
    // One charge per case file, so a retried finish can't charge twice (Metering.chargePages).
    uniqueIndex("quota_charge_case_file_idx").on(t.caseFileId),
  ],
);
