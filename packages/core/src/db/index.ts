import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

export * as schema from "./schema";
export { EMBEDDING_DIMENSIONS } from "./schema";
export { createDb } from "./client";

/**
 * Any Drizzle Postgres database with our schema: node-postgres or Neon in
 * production, PGlite in tests. Modules take this directly (ADR-0002).
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
