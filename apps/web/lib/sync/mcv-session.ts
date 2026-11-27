import "server-only";
import {
  buildSessionSnapshot,
  exportSession,
  fetchPanel,
  importSession,
  McvSessionExpiredError,
  McvWrongPasswordError,
  mcvLogin,
} from "@cedt-hub/connectors/mcv-session";
import { schema } from "@cedt-hub/db";
import { and, eq, gt, isNull, notInArray } from "@cedt-hub/db/orm";
import { deleteCredential, getCredential, saveCredential } from "../connectors/credentials";
import { getDb } from "../db";
import { credentialKey, mcvPasswordSyncAllowed } from "../mcv/password-sync";
import { acquireLock, getSyncState, releaseLock } from "./lock";
import { MCV_STALE_AFTER_MS, type SyncResult, saveMcvSnapshot } from "./mcv";

const { course, syncState, task } = schema;

/** After a failed login, wait this long before trying again, so a problem never hammers CU-SSO. */
const LOGIN_COOLDOWN_MS = 10 * 60 * 1000;

interface McvLoginSecret {
  u: string;
  p: string;
  /** Serialized cookie jar of the last good MCV session. */
  session: string | null;
  lastLoginAt: number | null;
  /** When the last login attempt failed for a reason other than a wrong password. */
  lastLoginFailedAt?: number | null;
  /** Set after MCV rejects the password: no more logins until the user updates it. */
  blocked: boolean;
}

export class McvPasswordSyncDisabledError extends Error {}

async function readSecret(userId: string) {
  const key = credentialKey();
  if (!key) return null;
  const cred = await getCredential(userId, "mcv", new Date(), key);
  if (!cred) return null;
  try {
    return JSON.parse(cred.secret) as McvLoginSecret;
  } catch {
    return null;
  }
}

async function writeSecret(userId: string, s: McvLoginSecret) {
  const key = credentialKey();
  if (!key) throw new McvPasswordSyncDisabledError("CREDENTIAL_ENCRYPTION_KEY is not set");
  await saveCredential(userId, "mcv", JSON.stringify(s), { label: s.u, key });
}

/** Save CUNET credentials after one successful login, then sync. Throws McvWrongPasswordError. */
export async function connectMcvPassword(
  userId: string,
  email: string,
  username: string,
  password: string,
) {
  if (!mcvPasswordSyncAllowed(email))
    throw new McvPasswordSyncDisabledError("Not enabled for this account");
  const jar = await mcvLogin(username, password);
  await writeSecret(userId, {
    u: username,
    p: password,
    session: await exportSession(jar),
    lastLoginAt: Date.now(),
    blocked: false,
  });
  return syncMcvSession(userId, { force: true });
}

export async function hasMcvPassword(userId: string) {
  return (await readSecret(userId)) !== null;
}

/**
 * Pending MCV items are upserted like the OAuth sync. An upcoming item that disappears from the
 * pending panel was handed in, so it is marked done (never deleted).
 */
export async function saveSessionSnapshot(
  userId: string,
  snap: Awaited<ReturnType<typeof buildSessionSnapshot>>,
  now = new Date(),
) {
  await saveMcvSnapshot(userId, { ...snap, fetchedCourses: [], failedCourses: [] });
  const pending = snap.tasks.map((t) => t.sourceId);
  await getDb()
    .update(task)
    .set({ completedAt: now })
    .where(
      and(
        eq(task.userId, userId),
        eq(task.source, "mcv"),
        isNull(task.completedAt),
        gt(task.dueAt, now),
        pending.length > 0 ? notInArray(task.sourceId, pending) : undefined,
      ),
    );
}

export async function syncMcvSession(
  userId: string,
  opts: { force?: boolean } = {},
): Promise<SyncResult> {
  const secret = await readSecret(userId);
  if (!secret) return { status: "skipped", reason: "not-connected" };
  if (!opts.force) {
    const state = await getSyncState(userId, "mcv");
    if (state?.lastSyncedAt && Date.now() - state.lastSyncedAt.getTime() < MCV_STALE_AFTER_MS) {
      return { status: "skipped", reason: "fresh" };
    }
  }
  if (!(await acquireLock(userId, "mcv"))) return { status: "skipped", reason: "running" };

  try {
    if (secret.blocked) throw new McvWrongPasswordError();
    let items: Awaited<ReturnType<typeof fetchPanel>>;
    try {
      if (!secret.session) throw new McvSessionExpiredError();
      items = await fetchPanel(await importSession(secret.session));
    } catch (err) {
      if (!(err instanceof McvSessionExpiredError)) throw err;
      // Session expired: log in again with the saved password (not again soon after a failure).
      if (secret.lastLoginFailedAt && Date.now() - secret.lastLoginFailedAt < LOGIN_COOLDOWN_MS) {
        throw new Error("MyCourseVille login failed recently; will try again in a few minutes.");
      }
      secret.lastLoginAt = Date.now();
      try {
        const jar = await mcvLogin(secret.u, secret.p);
        secret.session = await exportSession(jar);
        secret.lastLoginFailedAt = null;
        await writeSecret(userId, secret);
        items = await fetchPanel(jar);
      } catch (loginErr) {
        if (loginErr instanceof McvWrongPasswordError) secret.blocked = true;
        else secret.lastLoginFailedAt = Date.now();
        secret.session = null;
        await writeSecret(userId, secret);
        throw loginErr;
      }
    }
    const snap = await buildSessionSnapshot(items);
    await saveSessionSnapshot(userId, snap);
    await releaseLock(userId, "mcv", null);
    return {
      status: "ok",
      courses: snap.courses.length,
      tasks: snap.tasks.length,
      failedCourses: 0,
    };
  } catch (err) {
    const message =
      err instanceof McvWrongPasswordError
        ? "MyCourseVille rejected your CUNET password. Update it in Settings."
        : err instanceof Error
          ? err.message
          : String(err);
    await releaseLock(userId, "mcv", message);
    return { status: "error", error: message };
  }
}

/** Update the password (e.g. after changing it at Chula), clearing a block. */
export async function updateMcvPassword(userId: string, email: string, password: string) {
  const secret = await readSecret(userId);
  if (!secret) throw new McvPasswordSyncDisabledError("Not connected");
  return connectMcvPassword(userId, email, secret.u, password);
}

export async function disconnectMcvPassword(userId: string) {
  const db = getDb();
  await deleteCredential(userId, "mcv");
  await db.delete(task).where(and(eq(task.userId, userId), eq(task.source, "mcv")));
  await db.delete(course).where(and(eq(course.userId, userId), eq(course.source, "mcv")));
  await db.delete(syncState).where(and(eq(syncState.userId, userId), eq(syncState.source, "mcv")));
}

export async function mcvPasswordLabel(userId: string) {
  const s = await readSecret(userId);
  return s ? { username: s.u, blocked: s.blocked } : null;
}
