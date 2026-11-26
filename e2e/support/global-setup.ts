import postgres from "postgres";
import { E2E } from "./env";

/** Start every run from an empty database (schema stays; run `pnpm db:migrate` first). */
export default async function globalSetup() {
  const sql = postgres(E2E.databaseURL, { max: 1, onnotice: () => {} });
  try {
    const tables = await sql<{ tablename: string }[]>`
      select tablename from pg_tables
      where schemaname = 'public' and tablename not like '__drizzle%'`;
    if (tables.length === 0) throw new Error("No tables found: run `pnpm db:migrate` first.");
    const list = tables.map((t) => `"${t.tablename}"`).join(", ");
    await sql.unsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  } finally {
    await sql.end();
  }
}
