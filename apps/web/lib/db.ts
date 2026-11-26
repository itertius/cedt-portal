import "server-only";
import { createDb, type Database } from "@cedt-hub/db";

let db: Database | undefined;

/** Shared Drizzle client. Throws if DATABASE_URL is missing; check `authConfigured` first. */
export function getDb(): Database {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    db = createDb(url);
  }
  return db;
}
