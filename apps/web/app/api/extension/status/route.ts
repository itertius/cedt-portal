import { schema } from "@cedt-hub/db";
import { eq } from "@cedt-hub/db/orm";
import { authConfigured } from "@/lib/auth";
import { credentialInfo } from "@/lib/connectors/credentials";
import { getDb } from "@/lib/db";
import { verifyExtensionToken } from "@/lib/extension/tokens";
import { internshipCount } from "@/lib/sync/intern";
import { getSyncState } from "@/lib/sync/lock";

export const dynamic = "force-dynamic";

/** What the extension popup shows. */
export async function GET(request: Request) {
  if (!authConfigured) return Response.json({ error: "not-configured" }, { status: 503 });
  const token = await verifyExtensionToken(request.headers.get("authorization"));
  if (!token) return Response.json({ error: "invalid-token" }, { status: 401 });
  const [[u], cred, state, openings] = await Promise.all([
    getDb()
      .select({ name: schema.user.name })
      .from(schema.user)
      .where(eq(schema.user.id, token.userId)),
    credentialInfo(token.userId, "intern"),
    getSyncState(token.userId, "intern"),
    internshipCount(token.userId),
  ]);
  return Response.json({
    user: { name: u?.name ?? null },
    intern: {
      connected: Boolean(cred),
      status: state?.status ?? null,
      lastSyncedAt: state?.lastSyncedAt ?? null,
      lastError: state?.lastError ?? null,
      openings,
    },
  });
}
