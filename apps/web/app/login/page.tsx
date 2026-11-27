import { redirect } from "next/navigation";
import { authConfigured, cedtEnabled, getSession, mcvEnabled } from "@/lib/auth";
import { CedtSignInButton, McvSignInButton } from "./sign-in-button";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getSession()) redirect("/");

  const ready = authConfigured && (mcvEnabled || cedtEnabled);

  return (
    <main className="shell">
      <h1>Log in to CEDT Hub</h1>
      {cedtEnabled ? (
        <div className="stack">
          <p>Use your CEDT account, the same one as Talent Journey and the Intern Portal.</p>
          <CedtSignInButton disabled={!authConfigured} />
          {mcvEnabled ? (
            <>
              <p className="muted small">
                Or use MyCourseVille. Already signed up with MyCourseVille? Log in with it, then
                link your CEDT account in Settings so both open the same hub.
              </p>
              <McvSignInButton disabled={!authConfigured} secondary />
            </>
          ) : null}
        </div>
      ) : (
        <div className="stack">
          <p>Use your MyCourseVille account.</p>
          <McvSignInButton disabled={!ready} />
        </div>
      )}
      {ready ? null : <p className="meta">Login is not set up on this deployment yet.</p>}
    </main>
  );
}
