"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { setTaskCompleted } from "@/lib/dashboard";
import { syncMcv } from "@/lib/sync/mcv";

export async function syncNow() {
  const session = await getSession();
  if (!session) return { status: "error" as const, error: "Not logged in" };
  const result = await syncMcv(session.user.id, { force: true });
  revalidatePath("/");
  return result;
}

export async function toggleTask(taskId: string, completed: boolean) {
  const session = await getSession();
  if (!session) return;
  await setTaskCompleted(session.user.id, taskId, completed);
  revalidatePath("/");
}
