"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getAuth, getSession } from "@/lib/auth";
import { forgetGoogleEvents, googleAccountId, syncGcal } from "@/lib/sync/gcal";

export async function syncGoogleNow() {
  const session = await getSession();
  if (!session) return { status: "error" as const, error: "Not logged in" };
  const r = await syncGcal(session.user.id, { force: true });
  revalidatePath("/settings");
  revalidatePath("/calendar");
  return r;
}

export async function disconnectGoogle() {
  const session = await getSession();
  const auth = getAuth();
  if (!session || !auth) return;
  const accountId = await googleAccountId(session.user.id);
  if (!accountId) return;
  await auth.api.unlinkAccount({ body: { accountId }, headers: await headers() });
  await forgetGoogleEvents(session.user.id);
  revalidatePath("/settings");
  revalidatePath("/calendar");
}
