import "server-only";
import { fetchMcvSnapshot, McvApiError, type McvSnapshot } from "@cedt-hub/connectors/mcv";
import { schema } from "@cedt-hub/db";
import { and, eq, notInArray, sql } from "@cedt-hub/db/orm";
import { getAuth } from "../auth";
import { getDb } from "../db";
import { MCV_PROVIDER_ID } from "../mcv/profile";
import { acquireLock, releaseLock } from "./lock";

const { account, course, syncState, task } = schema;

/** How old data may get before a page view triggers a background sync. */
export const MCV_STALE_AFTER_MS = 15 * 60 * 1000;
export type SyncResult =
  | { status: "ok"; courses: number; tasks: number; failedCourses: number }
  | { status: "skipped"; reason: "running" | "fresh" | "not-connected" }
  | { status: "error"; error: string };

async function getMcvAccessToken(userId: string): Promise<string | null> {
  const auth = getAuth();
  if (!auth) return null;
  const [acc] = await getDb()
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, MCV_PROVIDER_ID)))
    .limit(1);
  if (!acc) return null;
  // Decrypts the stored token and refreshes it if it has expired.
  const tokens = await auth.api.getAccessToken({ body: { accountId: acc.id, userId } });
  return tokens.accessToken ?? null;
}

/** Write a snapshot. Upserts by (user, source, sourceId); user-owned fields are untouched. */
export async function saveMcvSnapshot(userId: string, snap: McvSnapshot) {
  const db = getDb();
  await db.transaction(async (tx) => {
    const courseIds = new Map<string, string>();
    if (snap.courses.length > 0) {
      const rows = await tx
        .insert(course)
        .values(snap.courses.map((c) => ({ ...c, userId })))
        .onConflictDoUpdate({
          target: [course.userId, course.source, course.sourceId],
          set: {
            code: sql`excluded.code`,
            title: sql`excluded.title`,
            year: sql`excluded.year`,
            semester: sql`excluded.semester`,
            role: sql`excluded.role`,
            url: sql`excluded.url`,
            updatedAt: new Date(),
          },
        })
        .returning({ id: course.id, sourceId: course.sourceId });
      for (const r of rows) courseIds.set(r.sourceId, r.id);
    }

    if (snap.tasks.length > 0) {
      await tx
        .insert(task)
        .values(
          snap.tasks.map(({ courseSourceId, ...t }) => ({
            ...t,
            userId,
            courseId: courseSourceId ? (courseIds.get(courseSourceId) ?? null) : null,
          })),
        )
        .onConflictDoUpdate({
          target: [task.userId, task.source, task.sourceId],
          set: {
            courseId: sql`excluded.course_id`,
            title: sql`excluded.title`,
            dueAt: sql`excluded.due_at`,
            url: sql`excluded.url`,
            updatedAt: new Date(),
          },
        });
    }

    // A course whose assignment list was fetched is complete: tasks MCV no longer lists
    // for it were deleted there, so delete them here. Failed courses are left alone.
    for (const sourceId of snap.fetchedCourses) {
      const courseId = courseIds.get(sourceId);
      if (!courseId) continue;
      const keep = snap.tasks.filter((t) => t.courseSourceId === sourceId).map((t) => t.sourceId);
      await tx
        .delete(task)
        .where(
          and(
            eq(task.userId, userId),
            eq(task.source, "mcv"),
            eq(task.courseId, courseId),
            keep.length > 0 ? notInArray(task.sourceId, keep) : undefined,
          ),
        );
    }
  });
}

export async function syncMcv(userId: string, opts: { force?: boolean } = {}): Promise<SyncResult> {
  const db = getDb();

  if (!opts.force) {
    const [state] = await db
      .select({ lastSyncedAt: syncState.lastSyncedAt })
      .from(syncState)
      .where(and(eq(syncState.userId, userId), eq(syncState.source, "mcv")));
    if (state?.lastSyncedAt && Date.now() - state.lastSyncedAt.getTime() < MCV_STALE_AFTER_MS) {
      return { status: "skipped", reason: "fresh" };
    }
  }

  if (!(await acquireLock(userId, "mcv"))) return { status: "skipped", reason: "running" };

  try {
    const token = await getMcvAccessToken(userId);
    if (!token) {
      await releaseLock(userId, "mcv", "Not connected to MyCourseVille");
      return { status: "skipped", reason: "not-connected" };
    }
    const snap = await fetchMcvSnapshot(token);
    await saveMcvSnapshot(userId, snap);
    await releaseLock(userId, "mcv", null);
    return {
      status: "ok",
      courses: snap.courses.length,
      tasks: snap.tasks.length,
      failedCourses: snap.failedCourses.length,
    };
  } catch (err) {
    const message =
      err instanceof McvApiError && err.status === 401
        ? "MyCourseVille rejected the login. Log out and log in again."
        : err instanceof Error
          ? err.message
          : String(err);
    await releaseLock(userId, "mcv", message);
    return { status: "error", error: message };
  }
}

/** All users with a MyCourseVille account, for the cron job. */
export async function mcvUserIds(): Promise<string[]> {
  const rows = await getDb()
    .select({ userId: account.userId })
    .from(account)
    .where(eq(account.providerId, MCV_PROVIDER_ID));
  return rows.map((r) => r.userId);
}
