import "server-only";
import { schema } from "@cedt-hub/db";
import { and, eq, isNull, lt, or, sql } from "@cedt-hub/db/orm";
import { getDb } from "../db";

const { syncState } = schema;
type SyncSource = (typeof schema.sourceEnum.enumValues)[number];

/** A "running" sync older than this is assumed dead and may be retried. */
const LOCK_TIMEOUT_MS = 5 * 60 * 1000;

/** Take the per-user, per-source lock. Returns false if another sync is already running. */
export async function acquireLock(userId: string, source: SyncSource): Promise<boolean> {
  const now = new Date();
  const rows = await getDb()
    .insert(syncState)
    .values({ userId, source, status: "running", startedAt: now })
    .onConflictDoUpdate({
      target: [syncState.userId, syncState.source],
      set: { status: "running", startedAt: now },
      setWhere: or(
        sql`${syncState.status} <> 'running'`,
        isNull(syncState.startedAt),
        lt(syncState.startedAt, new Date(now.getTime() - LOCK_TIMEOUT_MS)),
      ),
    })
    .returning({ userId: syncState.userId });
  return rows.length > 0;
}

export async function releaseLock(userId: string, source: SyncSource, error: string | null) {
  await getDb()
    .update(syncState)
    .set(
      error
        ? { status: "error", lastError: error.slice(0, 500) }
        : { status: "idle", lastError: null, lastSyncedAt: new Date() },
    )
    .where(and(eq(syncState.userId, userId), eq(syncState.source, source)));
}

export async function getSyncState(userId: string, source: SyncSource) {
  const [row] = await getDb()
    .select()
    .from(syncState)
    .where(and(eq(syncState.userId, userId), eq(syncState.source, source)));
  return row ?? null;
}
