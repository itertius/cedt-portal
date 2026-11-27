import { redirect } from "next/navigation";
import {
  authConfigured,
  cedtEnabled,
  getSession,
  googleLoginEnabled,
  mcvEnabled,
} from "@/lib/auth";
import { CedtSignInButton, GoogleSignInButton, McvSignInButton } from "./sign-in-button";

export const dynamic = "force-dynamic";

/** Better Auth's error codes on the OAuth redirect, in plain words. */
function errorMessage(code: string | undefined) {
  if (!code) return null;
  if (/unable_to_create_user|signup_disabled|access_denied_by_hook/i.test(code)) {
    return "This account isn't invited to CEDT Hub yet. Ask the owner to add your email.";
  }
  if (/access_denied/i.test(code)) return "Sign-in was cancelled.";
  return "Sign-in failed. Try again.";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next: rawNext } = await searchParams;
  // Only same-site relative paths, never "//evil.com" or "https://…".
  const next = rawNext && /^\/(?!\/)[^\\]*$/.test(rawNext) ? rawNext : "/";
  if (await getSession()) redirect(next);
  const google = googleLoginEnabled();
  const anyProvider = mcvEnabled || cedtEnabled || google;
  const ready = authConfigured && anyProvider;
  const message = errorMessage(error);

  return (
    <main className="shell">
      <h1>Log in to CEDT Hub</h1>
      {message ? (
        <p className="error" role="alert">
          {message}
        </p>
      ) : null}
      <div className="stack">
        {cedtEnabled ? (
          <>
            <p>Use your CEDT account, the same one as Talent Journey and the Intern Portal.</p>
            <CedtSignInButton next={next} disabled={!authConfigured} />
          </>
        ) : null}
        {mcvEnabled ? (
          <>
            {cedtEnabled ? (
              <p className="muted small">
                Or use MyCourseVille. Already signed up with MyCourseVille? Log in with it, then
                link your CEDT account in Settings so both open the same hub.
              </p>
            ) : (
              <p>Use your MyCourseVille account.</p>
            )}
            <McvSignInButton next={next} disabled={!authConfigured} secondary={cedtEnabled} />
          </>
        ) : null}
        {google ? (
          <>
            <p className="muted small">
              {cedtEnabled || mcvEnabled
                ? "Invited? You can also use Google."
                : "CEDT Hub is invite-only for now."}
            </p>
            <GoogleSignInButton
              next={next}
              disabled={!authConfigured}
              secondary={cedtEnabled || mcvEnabled}
            />
          </>
        ) : null}
        {!anyProvider ? <McvSignInButton disabled /> : null}
      </div>
      {ready ? null : <p className="meta">Login is not set up on this deployment yet.</p>}
    </main>
  );
}
