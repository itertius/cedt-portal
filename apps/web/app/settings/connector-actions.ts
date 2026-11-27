"use server";

import { GraderError } from "@cedt-hub/connectors/grader";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { connectGrader, disconnectGrader, syncGrader } from "@/lib/sync/grader";
import { connectIntern, disconnectIntern, InvalidCookieError, syncIntern } from "@/lib/sync/intern";

export interface ConnectState {
  ok?: string;
  error?: string;
}

function refresh() {
  revalidatePath("/settings");
  revalidatePath("/");
  revalidatePath("/internships");
  revalidatePath("/calendar");
}

export async function connectGraderAction(
  _prev: ConnectState,
  form: FormData,
): Promise<ConnectState> {
  const session = await getSession();
  if (!session) return { error: "Not logged in" };
  const login = String(form.get("login") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!login || !password) return { error: "Enter your grader login and password." };
  try {
    // The password lives only in this request: it is sent to the grader once and never stored.
    const r = await connectGrader(session.user.id, login, password);
    refresh();
    return r.status === "ok"
      ? { ok: `Connected. ${r.problems} problems synced.` }
      : { error: "Connected, but the first sync failed." };
  } catch (err) {
    if (err instanceof GraderError) {
      return {
        error:
          err.status === 429
            ? "Too many failed logins. Wait a few minutes before trying again."
            : err.message,
      };
    }
    return { error: "Could not reach the grader. Try again later." };
  }
}

export async function connectInternAction(
  _prev: ConnectState,
  form: FormData,
): Promise<ConnectState> {
  const session = await getSession();
  if (!session) return { error: "Not logged in" };
  try {
    const r = await connectIntern(session.user.id, String(form.get("cookie") ?? ""));
    refresh();
    return r.status === "ok"
      ? { ok: `Connected. ${r.openings} openings and ${r.deadlines} dates synced.` }
      : { error: "Connected, but the first sync failed." };
  } catch (err) {
    if (err instanceof InvalidCookieError) return { error: err.message };
    return { error: "Could not reach the Intern Portal. Try again later." };
  }
}

export async function syncConnectorAction(source: "grader" | "intern") {
  const session = await getSession();
  if (!session) return { status: "error" as const, error: "Not logged in" };
  const r =
    source === "grader"
      ? await syncGrader(session.user.id, { force: true })
      : await syncIntern(session.user.id, { force: true });
  refresh();
  return r;
}

export async function disconnectConnectorAction(source: "grader" | "intern") {
  const session = await getSession();
  if (!session) return;
  if (source === "grader") await disconnectGrader(session.user.id);
  else await disconnectIntern(session.user.id);
  refresh();
}
