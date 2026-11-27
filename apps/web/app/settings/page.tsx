import { schema } from "@cedt-hub/db";
import { and, eq } from "@cedt-hub/db/orm";
import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { CEDT_PROVIDER_ID, cedtEnabled, getSession, googleEnabled } from "@/lib/auth";
import { credentialInfo } from "@/lib/connectors/credentials";
import { getDb } from "@/lib/db";
import { listExtensionTokens } from "@/lib/extension/tokens";
import { relative } from "@/lib/format";
import { googleAccountId } from "@/lib/sync/gcal";
import { graderSummary } from "@/lib/sync/grader";
import { internshipCount } from "@/lib/sync/intern";
import { getSyncState } from "@/lib/sync/lock";
import { ConnectorControls, GraderConnectForm, InternConnectForm } from "./connector-forms";
import { revokeExtensionAction } from "./extension-actions";
import { ConnectGoogleButton, GoogleSyncControls, LinkAccountButton } from "./google-controls";

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

  const [googleLinked, mcv, gcal, grader, graderState, intern, internState] = await Promise.all([
    googleAccountId(userId),
    getSyncState(userId, "mcv"),
    getSyncState(userId, "gcal"),
    credentialInfo(userId, "grader"),
    getSyncState(userId, "grader"),
    credentialInfo(userId, "intern"),
    getSyncState(userId, "intern"),
  ]);
  const [graderStats, internships, extensions] = await Promise.all([
    grader ? graderSummary(userId) : null,
    intern ? internshipCount(userId) : 0,
    listExtensionTokens(userId),
  ]);
  const [cedtAccount] = cedtEnabled
    ? await getDb()
        .select({ id: schema.account.id })
        .from(schema.account)
        .where(
          and(eq(schema.account.userId, userId), eq(schema.account.providerId, CEDT_PROVIDER_ID)),
        )
    : [];
  const graderExpired = Boolean(grader?.expiresAt && grader.expiresAt <= new Date());
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

      {cedtEnabled ? (
        <section className="card" id="cedt">
          <h2>CEDT account</h2>
          {cedtAccount ? (
            <p>Linked. You can log in with CEDT or MyCourseVille; both open this hub.</p>
          ) : (
            <div className="stack">
              <p>Link your CEDT account (CEDT IDP) so you can also log in with it.</p>
              <LinkAccountButton provider="cedt" label="Link CEDT account" />
            </div>
          )}
        </section>
      ) : null}

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

      <section className="card" id="grader">
        <h2>CEDT Grader</h2>
        {grader ? (
          <div className="stack">
            <p>
              Connected as <strong>{grader.label}</strong>.{" "}
              {graderStats ? `${graderStats.total} problems, ${graderStats.solved} solved. ` : null}
              <span className="muted">{status(graderState)}</span>
              {grader.expiresAt ? (
                <span className="muted">
                  {" "}
                  · access {graderExpired ? "expired" : "expires"} {relative(grader.expiresAt)}
                </span>
              ) : null}
            </p>
            {graderState?.status === "error" ? (
              <p className="error">{graderState.lastError}</p>
            ) : null}
            {graderExpired || graderState?.status === "error" ? (
              <GraderConnectForm reconnect />
            ) : null}
            <ConnectorControls source="grader" label="CEDT Grader" />
          </div>
        ) : (
          <div className="stack">
            <p>See your solved and in-progress grader problems on the dashboard.</p>
            <GraderConnectForm />
          </div>
        )}
      </section>

      <section className="card" id="intern">
        <h2>CEDT Intern Portal</h2>
        {intern ? (
          <div className="stack">
            <p>
              Connected. {internships} openings synced.{" "}
              <span className="muted">{status(internState)}</span>
            </p>
            {internState?.status === "error" ? (
              <>
                <p className="error">{internState.lastError}</p>
                <InternConnectForm reconnect />
              </>
            ) : null}
            <ConnectorControls source="intern" label="the Intern Portal" />
          </div>
        ) : (
          <div className="stack">
            <p>
              Browse every opening sorted by pay, see your bookmarks, and get ranking deadlines on
              your calendar.
            </p>
            <InternConnectForm />
          </div>
        )}
      </section>

      <section className="card" id="extension">
        <h2>Browser extension</h2>
        {extensions.length === 0 ? (
          <p className="muted">
            The CEDT Hub extension keeps your Intern Portal session synced automatically, so you
            never paste a cookie again. Install it, click its icon, then{" "}
            <strong>Connect to CEDT Hub</strong>.
          </p>
        ) : (
          <ul className="apps">
            {extensions.map((x) => (
              <li key={x.id}>
                <strong>{x.label ?? "Browser"}</strong>
                <span className="muted">
                  {" "}
                  · connected {relative(x.createdAt)}
                  {x.lastUsedAt ? ` · last update ${relative(x.lastUsedAt)}` : " · not used yet"}
                </span>
                <form action={revokeExtensionAction} className="inline">
                  <input type="hidden" name="id" value={x.id} />
                  <button type="submit" className="button secondary small">
                    Disconnect
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
