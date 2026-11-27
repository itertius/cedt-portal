"use server";

import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { revokeExtensionToken } from "@/lib/extension/tokens";

export async function revokeExtensionAction(form: FormData) {
  const session = await getSession();
  const id = form.get("id");
  if (!session || typeof id !== "string") return;
  await revokeExtensionToken(session.user.id, id);
  revalidatePath("/settings");
}
