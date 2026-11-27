"use server";

import { McvLoginError, McvWrongPasswordError } from "@cedt-hub/connectors/mcv-session";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import {
  connectMcvPassword,
  disconnectMcvPassword,
  McvPasswordSyncDisabledError,
  syncMcvSession,
  updateMcvPassword,
} from "@/lib/sync/mcv-session";
import type { ConnectState } from "./connector-actions";

function refresh() {
  revalidatePath("/settings");
  revalidatePath("/");
  revalidatePath("/calendar");
}

function explain(err: unknown): ConnectState {
  if (err instanceof McvWrongPasswordError)
    return { error: "MyCourseVille rejected that CUNET username or password." };
  if (err instanceof McvPasswordSyncDisabledError)
    return { error: "MyCourseVille sync isn't enabled for this account." };
  if (err instanceof McvLoginError) return { error: err.message };
  return { error: "Could not reach MyCourseVille. Try again later." };
}

export async function connectMcvAction(_prev: ConnectState, form: FormData): Promise<ConnectState> {
  const session = await getSession();
  if (!session) return { error: "Not logged in" };
  const username = String(form.get("username") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!username || !password) return { error: "Enter your CUNET username and password." };
  if (form.get("consent") !== "on")
    return { error: "Please confirm you agree to store your password." };
  try {
    await connectMcvPassword(session.user.id, session.user.email, username, password);
    refresh();
    return { ok: "Connected." };
  } catch (err) {
    return explain(err);
  }
}

export async function updateMcvPasswordAction(
  _prev: ConnectState,
  form: FormData,
): Promise<ConnectState> {
  const session = await getSession();
  if (!session) return { error: "Not logged in" };
  const password = String(form.get("password") ?? "");
  if (!password) return { error: "Enter your new CUNET password." };
  try {
    await updateMcvPassword(session.user.id, session.user.email, password);
    refresh();
    return { ok: "Password updated." };
  } catch (err) {
    return explain(err);
  }
}

export async function syncMcvNowAction() {
  const session = await getSession();
  if (!session) return { status: "error" as const, error: "Not logged in" };
  const r = await syncMcvSession(session.user.id, { force: true });
  refresh();
  return r;
}

export async function disconnectMcvAction() {
  const session = await getSession();
  if (!session) return;
  await disconnectMcvPassword(session.user.id);
  refresh();
}
