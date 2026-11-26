import Link from "next/link";
import { getSession } from "@/lib/auth";
import { commitSha, deployEnv } from "@/lib/env";
import { SignOutButton } from "./sign-out-button";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();

  return (
    <main className="shell">
      <h1>CEDT Hub</h1>
      {session ? (
        <div className="stack">
          <p>
            Logged in as <strong>{session.user.name}</strong>.
          </p>
          <SignOutButton />
        </div>
      ) : (
        <div className="stack">
          <p>
            One login for MyCourseVille, Grader, Talent Journey, Intern Portal, Nisitez and ICES.
          </p>
          <Link className="button" href="/login">
            Log in
          </Link>
        </div>
      )}
      <p className="meta">
        {deployEnv()} · {commitSha()}
      </p>
    </main>
  );
}
