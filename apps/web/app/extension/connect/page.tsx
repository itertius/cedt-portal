import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { getSession } from "@/lib/auth";
import { PairClient } from "./pair-client";

export const dynamic = "force-dynamic";

export default async function ExtensionConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const { state = "" } = await searchParams;
  const here = `/extension/connect?state=${encodeURIComponent(state)}`;
  if (!(await getSession())) redirect(`/login?next=${encodeURIComponent(here)}`);

  return (
    <main className="shell">
      <Nav active="/settings" />
      <h1>Connect the browser extension</h1>
      {/^[A-Za-z0-9_-]{16,128}$/.test(state) ? (
        <PairClient state={state} />
      ) : (
        <p className="error">
          Open this page from the extension: click its icon, then Connect to CEDT Hub.
        </p>
      )}
    </main>
  );
}
