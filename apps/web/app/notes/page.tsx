import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { getSession } from "@/lib/auth";
import { listCourses } from "@/lib/calendar/events";
import { relative } from "@/lib/format";
import { listNotes } from "@/lib/notes/notes";
import { createNoteAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; course?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { q = "", course = "" } = await searchParams;
  const [notes, courses] = await Promise.all([
    listNotes(session.user.id, { q, courseId: course }),
    listCourses(session.user.id),
  ]);
  const filtering = Boolean(q.trim() || course);

  return (
    <main className="shell wide">
      <Nav active="/notes" />
      <header className="cal-header">
        <h1>Notes</h1>
        <form action={createNoteAction}>
          <input type="hidden" name="courseId" value={course} />
          <button type="submit" className="button">
            New note
          </button>
        </form>
      </header>

      <form className="search" aria-label="Search notes" method="get">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search notes"
          aria-label="Search notes"
        />
        <select
          className="search-field"
          name="course"
          defaultValue={course}
          aria-label="Filter by course"
        >
          <option value="">All courses</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code ? `${c.code} ` : ""}
              {c.title}
            </option>
          ))}
        </select>
        <button type="submit" className="button secondary small">
          Search
        </button>
        {filtering ? (
          <Link href="/notes" className="small">
            Clear
          </Link>
        ) : null}
      </form>

      {notes.length === 0 ? (
        <p className="muted">
          {filtering ? "No notes match." : "No notes yet. Create your first one."}
        </p>
      ) : (
        <ul className="note-list">
          {notes.map((n) => (
            <li key={n.id} className="card">
              <Link href={`/notes/${n.id}`} className="note-link">
                <strong>
                  {n.pinned ? "📌 " : ""}
                  {n.title || "Untitled note"}
                </strong>
                {n.excerpt ? <span className="muted"> {n.excerpt}</span> : null}
              </Link>
              <p className="muted small">
                Edited {relative(n.updatedAt)}
                {n.courseCode || n.courseTitle ? ` · ${n.courseCode ?? n.courseTitle}` : ""}
                {n.eventTitle ? ` · ${n.eventTitle}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
