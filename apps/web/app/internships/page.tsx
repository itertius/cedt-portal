import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { getSession } from "@/lib/auth";
import { credentialInfo } from "@/lib/connectors/credentials";
import { relative } from "@/lib/format";
import { type InternSort, listInternships } from "@/lib/sync/intern";
import { getSyncState } from "@/lib/sync/lock";

export const dynamic = "force-dynamic";

const SORTS: [InternSort, string][] = [
  ["pay", "Highest pay"],
  ["company", "Company A–Z"],
  ["title", "Position A–Z"],
];

export default async function InternshipsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; bookmarked?: string; condition?: string; sort?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const p = await searchParams;
  const sort = (SORTS.find(([s]) => s === p.sort)?.[0] ?? "pay") as InternSort;
  const bookmarked = p.bookmarked === "1";
  const [cred, state, rows] = await Promise.all([
    credentialInfo(session.user.id, "intern"),
    getSyncState(session.user.id, "intern"),
    listInternships(session.user.id, { q: p.q, bookmarked, condition: p.condition, sort }),
  ]);

  return (
    <main className="shell wide">
      <Nav active="/internships" />
      <header className="cal-header">
        <h1>Internships</h1>
        <span className="muted small">
          {state?.lastSyncedAt ? `Synced ${relative(state.lastSyncedAt)}` : null}
        </span>
      </header>
      {!cred ? (
        <p>
          <Link href="/settings#intern">Connect the CEDT Intern Portal</Link> to see openings here.
        </p>
      ) : (
        <>
          {state?.status === "error" ? (
            <p className="error">
              {state.lastError} <Link href="/settings#intern">Fix in Settings</Link>
            </p>
          ) : null}
          <form className="search" aria-label="Filter internships" method="get">
            <input
              className="search-field"
              type="search"
              name="q"
              defaultValue={p.q ?? ""}
              placeholder="Position, company or tag"
              aria-label="Search internships"
            />
            <select
              className="search-field"
              name="condition"
              defaultValue={p.condition ?? ""}
              aria-label="Working condition"
            >
              <option value="">Any working condition</option>
              <option value="On-Site">On-site</option>
              <option value="Hybrid">Hybrid</option>
              <option value="Online">Online</option>
            </select>
            <select className="search-field" name="sort" defaultValue={sort} aria-label="Sort">
              {SORTS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <label className="inline small">
              <input type="checkbox" name="bookmarked" value="1" defaultChecked={bookmarked} />{" "}
              Bookmarked only
            </label>
            <button type="submit" className="button secondary small">
              Apply
            </button>
          </form>
          <p className="muted small">{rows.length} openings</p>
          <ul className="note-list">
            {rows.map((o) => (
              <li key={o.openingId} className="card internship">
                <a href={o.url} target="_blank" rel="noreferrer" className="note-link">
                  <strong>
                    {o.bookmarked ? "★ " : ""}
                    {o.title}
                  </strong>{" "}
                  <span className="muted">· {o.company}</span>
                </a>
                <p className="muted small">
                  {o.compensation
                    ? `฿${o.compensation.toLocaleString("en-US")}${o.compensationType ? ` ${o.compensationType}` : ""}`
                    : "Pay not stated"}
                  {o.workingCondition ? ` · ${o.workingCondition}` : ""}
                  {o.quota ? ` · ${o.quota} seat${o.quota > 1 ? "s" : ""}` : ""}
                  {o.acceptingApplications ? "" : " · not accepting applications"}
                </p>
                {o.tags.length > 0 ? (
                  <p className="small">
                    {o.tags.map((t) => (
                      <span key={t} className="tag">
                        {t}
                      </span>
                    ))}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
