import "server-only";
import {
  cleanCookieHeader,
  currentSession,
  fetchInternOpenings,
  fetchInternSessions,
  INTERN_HOME,
  InternError,
  type NormalizedInternSession,
  type NormalizedInternship,
} from "@cedt-hub/connectors/intern";
import { schema } from "@cedt-hub/db";
import { and, asc, desc, eq, ilike, notInArray, or, type SQL, sql } from "@cedt-hub/db/orm";
import { deleteCredential, getCredential, saveCredential } from "../connectors/credentials";
import { getDb } from "../db";
import { likePattern } from "../notes/notes";
import { acquireLock, getSyncState, releaseLock } from "./lock";

const { internship, syncState, task } = schema;
export const INTERN_STALE_AFTER_MS = 30 * 60 * 1000;

export type InternSyncResult =
  | { status: "ok"; openings: number; deadlines: number }
  | { status: "skipped"; reason: "fresh" | "running" | "not-connected" }
  | { status: "error"; error: string; reconnect: boolean };

export class InvalidCookieError extends Error {}

/** Validate the pasted cookie against the portal, then store it encrypted. */
export async function connectIntern(userId: string, rawCookie: string) {
  const cookie = cleanCookieHeader(rawCookie);
  if (!cookie)
    throw new InvalidCookieError(
      "That does not look like a Cookie header. Copy the whole value of the Cookie request header.",
    );
  if (cookie.length > 8000) throw new InvalidCookieError("That cookie is too long.");
  try {
    await fetchInternSessions(cookie);
  } catch (err) {
    if (err instanceof InternError && (err.status === 401 || err.status === 403)) {
      throw new InvalidCookieError(
        "The Intern Portal did not accept this cookie. Log in there again and copy a fresh one.",
      );
    }
    throw err;
  }
  await saveCredential(userId, "intern", cookie, { label: "Intern Portal session" });
  return syncIntern(userId, { force: true });
}

export async function saveInternData(
  userId: string,
  session: NormalizedInternSession | null,
  openings: NormalizedInternship[],
  allDeadlines: NormalizedInternSession["deadlines"],
) {
  await getDb().transaction(async (tx) => {
    if (openings.length > 0) {
      await tx
        .insert(internship)
        .values(openings.map((o) => ({ ...o, userId })))
        .onConflictDoUpdate({
          target: [internship.userId, internship.openingId],
          set: {
            sessionId: sql`excluded.session_id`,
            title: sql`excluded.title`,
            company: sql`excluded.company`,
            logoUrl: sql`excluded.logo_url`,
            tags: sql`excluded.tags`,
            workingCondition: sql`excluded.working_condition`,
            compensation: sql`excluded.compensation`,
            compensationType: sql`excluded.compensation_type`,
            quota: sql`excluded.quota`,
            startDate: sql`excluded.start_date`,
            endDate: sql`excluded.end_date`,
            bookmarked: sql`excluded.bookmarked`,
            acceptingApplications: sql`excluded.accepting_applications`,
            url: sql`excluded.url`,
            updatedAt: new Date(),
          },
        });
    }
    if (session) {
      const keep = openings.map((o) => o.openingId);
      await tx
        .delete(internship)
        .where(
          and(
            eq(internship.userId, userId),
            keep.length ? notInArray(internship.openingId, keep) : undefined,
          ),
        );
    }

    // Session deadlines become tasks (the user's "done" is kept, as with MCV).
    if (allDeadlines.length > 0) {
      await tx
        .insert(task)
        .values(
          allDeadlines.map((d) => ({
            userId,
            source: "intern" as const,
            sourceId: d.sourceId,
            title: d.title,
            dueAt: d.dueAt,
            url: INTERN_HOME,
          })),
        )
        .onConflictDoUpdate({
          target: [task.userId, task.source, task.sourceId],
          set: { title: sql`excluded.title`, dueAt: sql`excluded.due_at`, updatedAt: new Date() },
        });
    }
    const keepTasks = allDeadlines.map((d) => d.sourceId);
    await tx
      .delete(task)
      .where(
        and(
          eq(task.userId, userId),
          eq(task.source, "intern"),
          keepTasks.length ? notInArray(task.sourceId, keepTasks) : undefined,
        ),
      );
  });
}

export async function syncIntern(
  userId: string,
  opts: { force?: boolean } = {},
): Promise<InternSyncResult> {
  const cred = await getCredential(userId, "intern");
  if (!cred) return { status: "skipped", reason: "not-connected" };
  if (!opts.force) {
    const state = await getSyncState(userId, "intern");
    if (state?.lastSyncedAt && Date.now() - state.lastSyncedAt.getTime() < INTERN_STALE_AFTER_MS) {
      return { status: "skipped", reason: "fresh" };
    }
  }
  if (!(await acquireLock(userId, "intern"))) return { status: "skipped", reason: "running" };
  try {
    const sessions = await fetchInternSessions(cred.secret);
    const current = currentSession(sessions);
    const openings = current ? await fetchInternOpenings(cred.secret, current.sessionId) : [];
    const deadlines = sessions.flatMap((s) => s.deadlines);
    await saveInternData(userId, current, openings, deadlines);
    await releaseLock(userId, "intern", null);
    return { status: "ok", openings: openings.length, deadlines: deadlines.length };
  } catch (err) {
    const reconnect = err instanceof InternError && (err.status === 401 || err.status === 403);
    const message = reconnect
      ? "Intern Portal session expired. Paste a fresh cookie in Settings."
      : err instanceof Error
        ? err.message
        : String(err);
    await releaseLock(userId, "intern", message);
    return { status: "error", error: message, reconnect };
  }
}

export async function disconnectIntern(userId: string) {
  const db = getDb();
  await deleteCredential(userId, "intern");
  await db.delete(internship).where(eq(internship.userId, userId));
  await db.delete(task).where(and(eq(task.userId, userId), eq(task.source, "intern")));
  await db
    .delete(syncState)
    .where(and(eq(syncState.userId, userId), eq(syncState.source, "intern")));
}

export type InternSort = "pay" | "company" | "title";

export async function listInternships(
  userId: string,
  f: { q?: string; bookmarked?: boolean; condition?: string; sort?: InternSort } = {},
) {
  const where: SQL[] = [eq(internship.userId, userId)];
  const q = f.q?.trim().slice(0, 100);
  if (q) {
    const p = likePattern(q);
    where.push(
      or(
        ilike(internship.title, p),
        ilike(internship.company, p),
        sql`array_to_string(${internship.tags}, ' ') ilike ${p}`,
      ) as SQL,
    );
  }
  if (f.bookmarked) where.push(eq(internship.bookmarked, true));
  if (f.condition) where.push(ilike(internship.workingCondition, likePattern(f.condition)));
  const order =
    f.sort === "company"
      ? [asc(internship.company), asc(internship.title)]
      : f.sort === "title"
        ? [asc(internship.title)]
        : [sql`${internship.compensation} desc nulls last`, asc(internship.company)];
  return getDb()
    .select()
    .from(internship)
    .where(and(...where))
    .orderBy(...order)
    .limit(500);
}

export async function bookmarkedInternships(userId: string, limit = 5) {
  return getDb()
    .select()
    .from(internship)
    .where(and(eq(internship.userId, userId), eq(internship.bookmarked, true)))
    .orderBy(desc(internship.compensation))
    .limit(limit);
}

export async function internshipCount(userId: string) {
  const [r] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(internship)
    .where(eq(internship.userId, userId));
  return r?.n ?? 0;
}
