import Link from "next/link";
import { after } from "next/server";
import { Nav } from "@/components/nav";
import { getSession } from "@/lib/auth";
import { getDashboard } from "@/lib/dashboard";
import { commitSha, deployEnv } from "@/lib/env";
import { MCV_STALE_AFTER_MS, syncMcv } from "@/lib/sync/mcv";
import { Dashboard } from "./dashboard";
import { SignOutButton } from "./sign-out-button";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();

  if (!session) {
    return (
      <main className="shell">
        <h1>CEDT Hub</h1>
        <div className="stack">
          <p>
            One login for MyCourseVille, Grader, Talent Journey, Intern Portal, Nisitez and ICES.
          </p>
          <Link className="button" href="/login">
            Log in
          </Link>
        </div>
        <Footer />
      </main>
    );
  }

  const data = await getDashboard(session.user.id);
  const stale =
    !data.sync?.lastSyncedAt || Date.now() - data.sync.lastSyncedAt.getTime() > MCV_STALE_AFTER_MS;
  if (stale && data.sync?.status !== "running") {
    // Refresh in the background after the response is sent; the next visit shows new data.
    after(() => syncMcv(session.user.id));
  }

  return (
    <main className="shell wide">
      <Nav active="/" />
      <Dashboard name={session.user.name} data={data} />
      <div className="stack">
        <SignOutButton />
      </div>
      <Footer />
    </main>
  );
}

function Footer() {
  return (
    <p className="meta">
      {deployEnv()} · {commitSha()}
    </p>
  );
}
