import "server-only";
import {
  deleteGoogleEvent,
  GoogleApiError,
  type HubEventForGoogle,
  insertGoogleEvent,
  listGoogleEvents,
  type NormalizedGoogleEvent,
  normalizeGoogleEvent,
  patchGoogleEvent,
} from "@cedt-hub/connectors/gcal";
import { schema } from "@cedt-hub/db";
import { and, eq, gt, inArray, isNull, lt, notInArray, or, sql } from "@cedt-hub/db/orm";
import { GOOGLE_PROVIDER_ID, getAuth } from "../auth";
import { getDb } from "../db";
import { acquireLock, getSyncState, releaseLock } from "./lock";

const { account, event } = schema;

const DAY = 24 * 60 * 60 * 1000;
/** Google events in this window are mirrored into the hub. */
export const GCAL_WINDOW = { pastDays: 30, futureDays: 180 };
export const GCAL_STALE_AFTER_MS = 15 * 60 * 1000;

export type GcalSyncResult =
  | { status: "ok"; pushed: number; pulled: number; deleted: number }
  | { status: "skipped"; reason: "running" | "fresh" | "not-connected" }
  | { status: "error"; error: string; reconnect?: boolean };

export interface GcalApi {
  list: typeof listGoogleEvents;
  insert: typeof insertGoogleEvent;
  patch: typeof patchGoogleEvent;
  remove: typeof deleteGoogleEvent;
}

const realApi: GcalApi = {
  list: listGoogleEvents,
  insert: insertGoogleEvent,
  patch: patchGoogleEvent,
  remove: deleteGoogleEvent,
};

export async function googleAccountId(userId: string): Promise<string | null> {
  const [acc] = await getDb()
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, GOOGLE_PROVIDER_ID)))
    .limit(1);
  return acc?.id ?? null;
}

async function googleAccessToken(userId: string): Promise<string | null> {
  const auth = getAuth();
  const accountId = await googleAccountId(userId);
  if (!auth || !accountId) return null;
  const tokens = await auth.api.getAccessToken({ body: { accountId, userId } });
  return tokens.accessToken ?? null;
}

const toGoogle = (e: typeof event.$inferSelect): HubEventForGoogle => ({
  id: e.id,
  title: e.title,
  description: e.description,
  location: e.location,
  startsAt: e.startsAt,
  endsAt: e.endsAt,
  allDay: e.allDay,
});

/** Push hub events that are new or changed since their last push. */
async function push(userId: string, token: string, api: GcalApi) {
  const db = getDb();
  const pending = await db
    .select()
    .from(event)
    .where(
      and(
        eq(event.userId, userId),
        eq(event.source, "hub"),
        or(isNull(event.pushedAt), gt(event.updatedAt, event.pushedAt)),
      ),
    );
  let pushed = 0;
  for (const e of pending) {
    let remote = null;
    if (e.remoteId) {
      try {
        remote = await api.patch(token, e.remoteId, toGoogle(e));
      } catch (err) {
        // Deleted in Google since our last pull: create it again.
        if (!(err instanceof GoogleApiError && (err.status === 404 || err.status === 410)))
          throw err;
      }
    }
    remote ??= await api.insert(token, toGoogle(e));
    const now = new Date();
    // Set updatedAt = pushedAt so this write is not itself seen as a local change.
    await db
      .update(event)
      .set({
        remoteId: remote.id,
        remoteUpdated: remote.updated ?? null,
        pushedAt: now,
        updatedAt: now,
      })
      .where(and(eq(event.id, e.id), eq(event.userId, userId)));
    pushed++;
  }
  return pushed;
}

/** Apply Google's view of the window to the hub. Returns counts for reporting. */
export async function applyGoogleEvents(
  userId: string,
  token: string,
  items: NormalizedGoogleEvent[],
  windowStart: Date,
  windowEnd: Date,
  api: Pick<GcalApi, "remove"> = realApi,
) {
  const db = getDb();
  let pulled = 0;
  let deleted = 0;

  const hubCopies = items.filter((i) => i.hubId);
  const hubIds = hubCopies.map((i) => i.hubId as string);
  const hubRows = hubIds.length
    ? await db
        .select()
        .from(event)
        .where(and(eq(event.userId, userId), eq(event.source, "hub"), inArray(event.id, hubIds)))
    : [];
  const hubById = new Map(hubRows.map((r) => [r.id, r]));

  for (const g of hubCopies) {
    const local = hubById.get(g.hubId as string);
    if (!local) {
      // Copy of a hub event that no longer exists here (deleted while the push failed).
      if (!g.cancelled) {
        await api.remove(token, g.remoteId);
        deleted++;
      }
      continue;
    }
    if (g.cancelled) {
      // Deleted in Google: delete here too.
      await db.delete(event).where(and(eq(event.id, local.id), eq(event.userId, userId)));
      deleted++;
      continue;
    }
    const editedInGoogle = g.updated !== null && g.updated !== local.remoteUpdated;
    const editedHere = local.pushedAt === null || local.updatedAt > local.pushedAt;
    if (editedInGoogle && !editedHere) {
      const now = new Date();
      await db
        .update(event)
        .set({
          title: g.title,
          description: g.description,
          location: g.location,
          startsAt: g.startsAt,
          endsAt: g.endsAt,
          allDay: g.allDay,
          remoteId: g.remoteId,
          remoteUpdated: g.updated,
          pushedAt: now,
          updatedAt: now,
        })
        .where(and(eq(event.id, local.id), eq(event.userId, userId)));
      pulled++;
    }
  }

  // Events that live in Google: mirror them read-only as source "gcal".
  const native = items.filter((i) => !i.hubId);
  const live = native.filter((i) => !i.cancelled);
  if (live.length > 0) {
    await db
      .insert(event)
      .values(
        live.map((g) => ({
          userId,
          source: "gcal" as const,
          sourceId: g.remoteId,
          title: g.title,
          description: g.description,
          location: g.location,
          startsAt: g.startsAt,
          endsAt: g.endsAt,
          allDay: g.allDay,
          url: g.url,
          remoteUpdated: g.updated,
        })),
      )
      .onConflictDoUpdate({
        target: [event.userId, event.source, event.sourceId],
        set: {
          title: sql`excluded.title`,
          description: sql`excluded.description`,
          location: sql`excluded.location`,
          startsAt: sql`excluded.starts_at`,
          endsAt: sql`excluded.ends_at`,
          allDay: sql`excluded.all_day`,
          url: sql`excluded.url`,
          remoteUpdated: sql`excluded.remote_updated`,
          updatedAt: new Date(),
        },
      });
    pulled += live.length;
  }

  // Any mirrored Google event in the window that Google no longer lists (or lists as cancelled).
  const keep = live.map((g) => g.remoteId);
  const removed = await db
    .delete(event)
    .where(
      and(
        eq(event.userId, userId),
        eq(event.source, "gcal"),
        lt(event.startsAt, windowEnd),
        gt(event.endsAt, windowStart),
        keep.length > 0 ? notInArray(event.sourceId, keep) : undefined,
      ),
    )
    .returning({ id: event.id });
  deleted += removed.length;

  return { pulled, deleted };
}

export async function syncGcal(
  userId: string,
  opts: { force?: boolean; api?: GcalApi; now?: Date } = {},
): Promise<GcalSyncResult> {
  const api = opts.api ?? realApi;
  if (!(await googleAccountId(userId))) return { status: "skipped", reason: "not-connected" };

  if (!opts.force) {
    const state = await getSyncState(userId, "gcal");
    if (state?.lastSyncedAt && Date.now() - state.lastSyncedAt.getTime() < GCAL_STALE_AFTER_MS) {
      return { status: "skipped", reason: "fresh" };
    }
  }
  if (!(await acquireLock(userId, "gcal"))) return { status: "skipped", reason: "running" };

  try {
    const token = await googleAccessToken(userId);
    if (!token) throw new Error("Google is not connected");
    const now = opts.now ?? new Date();
    const windowStart = new Date(now.getTime() - GCAL_WINDOW.pastDays * DAY);
    const windowEnd = new Date(now.getTime() + GCAL_WINDOW.futureDays * DAY);

    const pushed = await push(userId, token, api);
    const items = (await api.list(token, windowStart, windowEnd))
      .map(normalizeGoogleEvent)
      .filter((g): g is NormalizedGoogleEvent => g !== null);
    const { pulled, deleted } = await applyGoogleEvents(
      userId,
      token,
      items,
      windowStart,
      windowEnd,
      api,
    );

    await releaseLock(userId, "gcal", null);
    return { status: "ok", pushed, pulled, deleted };
  } catch (err) {
    const reconnect =
      (err instanceof GoogleApiError && err.status === 401) ||
      (err instanceof Error && /invalid_grant|refresh/i.test(err.message));
    const message = reconnect
      ? "Google access expired. Reconnect Google Calendar in Settings."
      : err instanceof Error
        ? err.message
        : String(err);
    await releaseLock(userId, "gcal", message);
    return { status: "error", error: message, reconnect };
  }
}

/** Remove a hub event's Google copy right away (best effort; the next sync cleans up otherwise). */
export async function deleteGoogleCopy(
  userId: string,
  remoteId: string | null,
  api: GcalApi = realApi,
) {
  if (!remoteId) return;
  try {
    const token = await googleAccessToken(userId);
    if (token) await api.remove(token, remoteId);
  } catch (err) {
    console.error("deleteGoogleCopy failed", err);
  }
}

/** Disconnect: forget mirrored Google events. Hub events stay; their Google copies stay too. */
export async function forgetGoogleEvents(userId: string) {
  const db = getDb();
  await db.delete(event).where(and(eq(event.userId, userId), eq(event.source, "gcal")));
  await db
    .update(event)
    .set({ remoteId: null, remoteUpdated: null, pushedAt: null })
    .where(and(eq(event.userId, userId), eq(event.source, "hub")));
}

export async function gcalUserIds(): Promise<string[]> {
  const rows = await getDb()
    .select({ userId: account.userId })
    .from(account)
    .where(eq(account.providerId, GOOGLE_PROVIDER_ID));
  return rows.map((r) => r.userId);
}
