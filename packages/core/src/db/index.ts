import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

export * as schema from "./schema";
export { EMBEDDING_DIMENSIONS } from "./schema";
export { createDb } from "./client";
export { createDrizzleUnitOfWork } from "./repositories/unit-of-work";

/**
 * Any Drizzle Postgres database with our schema: node-postgres or Neon in
 * production, PGlite in tests. Only repositories take it (ADR-0006).
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
