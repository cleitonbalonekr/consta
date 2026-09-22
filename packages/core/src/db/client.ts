import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import type { Db } from "./index";

/** Opens a pooled connection. Production and local Postgres use this; tests use PGlite. */
export function createDb(url: string): Db {
  return drizzle(url, { schema });
}
