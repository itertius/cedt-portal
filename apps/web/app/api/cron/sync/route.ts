import { authConfigured } from "@/lib/auth";
import { gcalUserIds, syncGcal } from "@/lib/sync/gcal";
import { mcvUserIds, syncMcv } from "@/lib/sync/mcv";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily background sync (MCV + Google Calendar) for every connected user. Always a full sync.
 * Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`. On the club server, call it
 * the same way from a system cron.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!authConfigured) return Response.json({ error: "not configured" }, { status: 503 });

  type Counts = { users: number; ok: number; skipped: number; error: number };
  const empty = (): Counts => ({ users: 0, ok: 0, skipped: 0, error: 0 });
  const summary = { mcv: empty(), gcal: empty() };
  for (const userId of await mcvUserIds()) {
    summary.mcv.users++;
    summary.mcv[(await syncMcv(userId, { force: true })).status]++;
  }
  for (const userId of await gcalUserIds()) {
    summary.gcal.users++;
    summary.gcal[(await syncGcal(userId, { force: true })).status]++;
  }
  return Response.json(summary);
}
