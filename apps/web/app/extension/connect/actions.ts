"use server";

import { getSession } from "@/lib/auth";
import { createExtensionToken } from "@/lib/extension/tokens";

/** Issue a token for the extension waiting on this page. It is handed over in-page, never shown. */
export async function approveExtensionAction(label: string) {
  const session = await getSession();
  if (!session) return { error: "Not logged in" as const };
  return { token: await createExtensionToken(session.user.id, label) };
}
