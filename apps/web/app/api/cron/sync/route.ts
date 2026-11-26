import { authConfigured } from "@/lib/auth";
import { mcvUserIds, syncMcv } from "@/lib/sync/mcv";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily background sync for every MCV user.
 * Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`. On the club server, call it
 * the same way from a system cron.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!authConfigured) return Response.json({ error: "not configured" }, { status: 503 });

  const summary = { users: 0, ok: 0, skipped: 0, error: 0 };
  for (const userId of await mcvUserIds()) {
    summary.users++;
    const r = await syncMcv(userId);
    summary[r.status]++;
  }
  return Response.json(summary);
}
