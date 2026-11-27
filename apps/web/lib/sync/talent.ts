import "server-only";
import { fetchTalentActivities, type NormalizedTalentActivity } from "@cedt-hub/connectors/talent";
import { schema } from "@cedt-hub/db";
import { and, asc, gt, gte, lt, notInArray, sql } from "@cedt-hub/db/orm";
import { getDb } from "../db";

const { appState, talentActivity } = schema;

const STATE_KEY = "talent.synced_at";
/** Public feed: refresh at most hourly, so we stay polite to Talent Journey. */
export const TALENT_STALE_AFTER_MS = 60 * 60 * 1000;
/** Postgres advisory lock id so only one instance fetches at a time. */
const LOCK_ID = 7_301_001;

export type TalentSyncResult =
  | { status: "ok"; activities: number; removed: number }
  | { status: "skipped"; reason: "fresh" | "running" }
  | { status: "error"; error: string };

export async function talentSyncedAt(): Promise<Date | null> {
  const [row] = await getDb()
    .select({ value: appState.value })
    .from(appState)
    .where(sql`${appState.key} = ${STATE_KEY}`);
  return row?.value ? new Date(row.value) : null;
}

/**
 * Store the feed. Upcoming activities missing from it were cancelled; past ones are kept.
 * Guarded by a transaction-scoped advisory lock: it is released with the transaction, so it is
 * safe with connection pools (including Neon's pooler). Returns null if another save holds it.
 */
export async function saveTalentActivities(items: NormalizedTalentActivity[], now = new Date()) {
  return getDb().transaction(async (tx) => {
    const [row] = (await tx.execute(
      sql`select pg_try_advisory_xact_lock(${LOCK_ID}) as locked`,
    )) as unknown as { locked: boolean }[];
    if (!row?.locked) return null;
    if (items.length > 0) {
      await tx
        .insert(talentActivity)
        .values(items)
        .onConflictDoUpdate({
          target: talentActivity.activityId,
          set: {
            name: sql`excluded.name`,
            organization: sql`excluded.organization`,
            startsAt: sql`excluded.starts_at`,
            endsAt: sql`excluded.ends_at`,
            status: sql`excluded.status`,
            participants: sql`excluded.participants`,
            maxParticipants: sql`excluded.max_participants`,
            posterUrl: sql`excluded.poster_url`,
            updatedAt: now,
          },
        });
    }
    const keep = items.map((i) => i.activityId);
    const removed = await tx
      .delete(talentActivity)
      .where(
        and(
          gt(talentActivity.startsAt, now),
          keep.length > 0 ? notInArray(talentActivity.activityId, keep) : undefined,
        ),
      )
      .returning({ id: talentActivity.activityId });
    await tx
      .insert(appState)
      .values({ key: STATE_KEY, value: now.toISOString() })
      .onConflictDoUpdate({
        target: appState.key,
        set: { value: now.toISOString(), updatedAt: now },
      });
    return removed.length;
  });
}

export async function syncTalent(
  opts: { force?: boolean; fetchImpl?: typeof fetch; now?: Date } = {},
): Promise<TalentSyncResult> {
  // One clock for the freshness check and the save, so callers (and tests) can pin time.
  const now = opts.now ?? new Date();
  if (!opts.force) {
    const last = await talentSyncedAt();
    if (last && now.getTime() - last.getTime() < TALENT_STALE_AFTER_MS) {
      return { status: "skipped", reason: "fresh" };
    }
  }
  try {
    const items = await fetchTalentActivities(opts.fetchImpl);
    const removed = await saveTalentActivities(items, now);
    if (removed === null) return { status: "skipped", reason: "running" };
    return { status: "ok", activities: items.length, removed };
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

export async function listTalentActivities(from: Date, to: Date) {
  return getDb()
    .select()
    .from(talentActivity)
    .where(and(lt(talentActivity.startsAt, to), gt(talentActivity.endsAt, from)))
    .orderBy(asc(talentActivity.startsAt));
}

export async function upcomingTalentActivities(limit = 5, now = new Date()) {
  return getDb()
    .select()
    .from(talentActivity)
    .where(gte(talentActivity.endsAt, now))
    .orderBy(asc(talentActivity.startsAt))
    .limit(limit);
}
