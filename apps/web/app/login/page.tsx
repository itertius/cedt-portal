import { redirect } from "next/navigation";
import { authConfigured, getSession, mcvEnabled } from "@/lib/auth";
import { McvSignInButton } from "./sign-in-button";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getSession()) redirect("/");

  const ready = authConfigured && mcvEnabled;

  return (
    <main className="shell">
      <h1>Log in to CEDT Hub</h1>
      <p>Use your MyCourseVille account. Chula SSO is coming later.</p>
      <McvSignInButton disabled={!ready} />
      {ready ? null : <p className="meta">Login is not set up on this deployment yet.</p>}
    </main>
  );
}
