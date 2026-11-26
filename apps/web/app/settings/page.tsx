import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { getSession, googleEnabled } from "@/lib/auth";
import { relative } from "@/lib/format";
import { googleAccountId } from "@/lib/sync/gcal";
import { getSyncState } from "@/lib/sync/lock";
import { ConnectGoogleButton, GoogleSyncControls } from "./google-controls";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const userId = session.user.id;
  const { error } = await searchParams;

  const [googleLinked, mcv, gcal] = await Promise.all([
    googleAccountId(userId),
    getSyncState(userId, "mcv"),
    getSyncState(userId, "gcal"),
  ]);
  const status = (s: typeof mcv) =>
    s?.status === "error"
      ? null
      : s?.lastSyncedAt
        ? `Last synced ${relative(s.lastSyncedAt)}`
        : s?.status === "running"
          ? "Syncing…"
          : "Not synced yet";

  return (
    <main className="shell wide">
      <Nav active="/settings" />
      <h1>Settings</h1>
      {error ? (
        <p className="error" role="alert">
          Google connection failed ({error}). Try again.
        </p>
      ) : null}

      <section className="card">
        <h2>MyCourseVille</h2>
        <p>
          Connected as <strong>{session.user.name}</strong>.{" "}
          <span className="muted">{status(mcv)}</span>
        </p>
        {mcv?.status === "error" ? <p className="error">{mcv.lastError}</p> : null}
      </section>

      <section className="card" id="google">
        <h2>Google Calendar</h2>
        {!googleEnabled ? (
          <p className="muted">Google Calendar is not set up on this deployment yet.</p>
        ) : googleLinked ? (
          <div className="stack">
            <p>
              Connected. Your hub events are copied to your Google Calendar, and Google events show
              up in the hub calendar. <span className="muted">{status(gcal)}</span>
            </p>
            {gcal?.status === "error" ? (
              <div className="stack">
                <p className="error">{gcal.lastError}</p>
                <ConnectGoogleButton label="Reconnect Google" />
              </div>
            ) : null}
            <GoogleSyncControls />
          </div>
        ) : (
          <div className="stack">
            <p>
              Two-way sync with your primary Google Calendar: events you add here appear in Google,
              and Google events appear here (read-only). Only events from 30 days ago to 6 months
              ahead are synced.
            </p>
            <ConnectGoogleButton />
          </div>
        )}
      </section>
    </main>
  );
}
