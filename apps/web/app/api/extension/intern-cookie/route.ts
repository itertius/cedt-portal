import { authConfigured } from "@/lib/auth";
import { verifyExtensionToken } from "@/lib/extension/tokens";
import { connectIntern, InvalidCookieError } from "@/lib/sync/intern";

export const dynamic = "force-dynamic";

/**
 * The browser extension sends the user's Intern Portal session cookie here whenever it changes.
 * Same path as pasting it in Settings: validated against the portal, stored encrypted, synced.
 */
export async function POST(request: Request) {
  if (!authConfigured) return Response.json({ error: "not-configured" }, { status: 503 });
  const token = await verifyExtensionToken(request.headers.get("authorization"));
  if (!token) return Response.json({ error: "invalid-token" }, { status: 401 });

  let cookie = "";
  try {
    const body = (await request.json()) as { cookie?: unknown };
    cookie = typeof body.cookie === "string" ? body.cookie : "";
  } catch {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  if (!cookie || cookie.length > 8000)
    return Response.json({ error: "bad-request" }, { status: 400 });

  try {
    const r = await connectIntern(
      token.userId,
      cookie,
      "Intern Portal session (browser extension)",
    );
    return Response.json(
      r.status === "ok" ? { status: "ok", openings: r.openings } : { status: r.status },
    );
  } catch (err) {
    if (err instanceof InvalidCookieError) {
      // Logged out of the portal (or the session expired): the extension asks the user to log in.
      return Response.json({ error: "portal-rejected" }, { status: 422 });
    }
    return Response.json({ error: "portal-unreachable" }, { status: 502 });
  }
}
