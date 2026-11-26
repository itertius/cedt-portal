import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export { schema };

export type Database = ReturnType<typeof createDb>;

export function createDb(url: string) {
  // postgres-js connects lazily, so creating the client never touches the network.
  const client = postgres(url, { max: 5, prepare: false });
  return drizzle(client, { schema, casing: "snake_case" });
}
