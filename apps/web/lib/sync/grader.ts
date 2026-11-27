import "server-only";
import {
  fetchGraderProblems,
  GraderError,
  graderLogin,
  type NormalizedGraderProblem,
  problemState,
} from "@cedt-hub/connectors/grader";
import { schema } from "@cedt-hub/db";
import { and, desc, eq, notInArray, sql } from "@cedt-hub/db/orm";
import { deleteCredential, getCredential, saveCredential } from "../connectors/credentials";
import { getDb } from "../db";
import { acquireLock, getSyncState, releaseLock } from "./lock";

const { graderProblem, syncState } = schema;
export const GRADER_STALE_AFTER_MS = 30 * 60 * 1000;

export type GraderSyncResult =
  | { status: "ok"; problems: number }
  | { status: "skipped"; reason: "fresh" | "running" | "not-connected" }
  | { status: "error"; error: string; reconnect: boolean };

/**
 * Exchange the password for a JWT and store only the JWT. The password is used for this one
 * request and is never stored or logged.
 */
export async function connectGrader(userId: string, login: string, password: string) {
  const session = await graderLogin(login, password);
  await saveCredential(userId, "grader", session.token, {
    label: session.user.fullName
      ? `${session.user.login} (${session.user.fullName})`
      : session.user.login,
    expiresAt: session.expiresAt,
  });
  return syncGrader(userId, { force: true });
}

export async function saveGraderProblems(userId: string, problems: NormalizedGraderProblem[]) {
  await getDb().transaction(async (tx) => {
    if (problems.length > 0) {
      await tx
        .insert(graderProblem)
        .values(problems.map((p) => ({ ...p, userId })))
        .onConflictDoUpdate({
          target: [graderProblem.userId, graderProblem.problemId],
          set: {
            name: sql`excluded.name`,
            fullName: sql`excluded.full_name`,
            bestScore: sql`excluded.best_score`,
            lastScore: sql`excluded.last_score`,
            submissionCount: sql`excluded.submission_count`,
            lastSubmittedAt: sql`excluded.last_submitted_at`,
            tags: sql`excluded.tags`,
            updatedAt: new Date(),
          },
        });
    }
    const keep = problems.map((p) => p.problemId);
    await tx
      .delete(graderProblem)
      .where(
        and(
          eq(graderProblem.userId, userId),
          keep.length ? notInArray(graderProblem.problemId, keep) : undefined,
        ),
      );
  });
}

export async function syncGrader(
  userId: string,
  opts: { force?: boolean } = {},
): Promise<GraderSyncResult> {
  const cred = await getCredential(userId, "grader");
  if (!cred) return { status: "skipped", reason: "not-connected" };
  if (!opts.force) {
    const state = await getSyncState(userId, "grader");
    if (state?.lastSyncedAt && Date.now() - state.lastSyncedAt.getTime() < GRADER_STALE_AFTER_MS) {
      return { status: "skipped", reason: "fresh" };
    }
  }
  if (!(await acquireLock(userId, "grader"))) return { status: "skipped", reason: "running" };
  try {
    if (cred.expired)
      throw new GraderError(
        "Grader access expired (tokens last 12 hours). Reconnect to refresh.",
        401,
      );
    const problems = await fetchGraderProblems(cred.secret);
    await saveGraderProblems(userId, problems);
    await releaseLock(userId, "grader", null);
    return { status: "ok", problems: problems.length };
  } catch (err) {
    const reconnect = err instanceof GraderError && err.status === 401;
    const message = reconnect
      ? "Grader access expired. Reconnect with your grader login to refresh."
      : err instanceof Error
        ? err.message
        : String(err);
    await releaseLock(userId, "grader", message);
    return { status: "error", error: message, reconnect };
  }
}

export async function disconnectGrader(userId: string) {
  const db = getDb();
  await deleteCredential(userId, "grader");
  await db.delete(graderProblem).where(eq(graderProblem.userId, userId));
  await db
    .delete(syncState)
    .where(and(eq(syncState.userId, userId), eq(syncState.source, "grader")));
}

export async function graderSummary(userId: string) {
  const rows = await getDb()
    .select()
    .from(graderProblem)
    .where(eq(graderProblem.userId, userId))
    .orderBy(desc(graderProblem.lastSubmittedAt));
  const withState = rows.map((r) => ({ ...r, state: problemState(r) }));
  return {
    total: rows.length,
    solved: withState.filter((r) => r.state === "solved").length,
    inProgress: withState.filter((r) => r.state === "partial" || r.state === "attempted"),
  };
}
