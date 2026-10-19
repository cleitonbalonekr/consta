import { PGlite } from "@electric-sql/pglite";
import { vector } from "@electric-sql/pglite-pgvector";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { fileURLToPath } from "node:url";
import { LawyerId } from "../shared";
import type { Db } from "./index";
import * as schema from "./schema";

/** A fresh in-memory Postgres with every migration applied, for integration tests. */
export async function createTestDb(): Promise<Db> {
  const db = drizzle(new PGlite({ extensions: { vector } }), { schema });
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("./migrations", import.meta.url)) });
  return db;
}

/** Inserts the Better Auth user a lawyer is, so rows that reference the lawyer can be written. */
export async function insertLawyer(db: Db, id = crypto.randomUUID()): Promise<LawyerId> {
  await db.insert(schema.user).values({ id, name: "", email: `${id}@example.com` });
  return LawyerId(id);
}
