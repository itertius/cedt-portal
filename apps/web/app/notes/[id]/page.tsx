import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { getSession } from "@/lib/auth";
import { listCourses } from "@/lib/calendar/events";
import { dateKeyOf, formatDayKey } from "@/lib/calendar/time";
import { getNote, linkableEvents } from "@/lib/notes/notes";
import { deleteNoteAction } from "../actions";
import { NoteEditor } from "../note-editor";

export const dynamic = "force-dynamic";

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;
  const [n, courses, events] = await Promise.all([
    getNote(session.user.id, id),
    listCourses(session.user.id),
    linkableEvents(session.user.id),
  ]);
  if (!n) notFound();

  return (
    <main className="shell wide">
      <Nav active="/notes" />
      <p>
        <Link href="/notes">← All notes</Link>
      </p>
      <NoteEditor
        note={{
          id: n.id,
          title: n.title,
          body: n.body,
          courseId: n.courseId ?? "",
          eventId: n.eventId ?? "",
          pinned: n.pinned,
        }}
        courses={courses.map((c) => ({
          id: c.id,
          label: `${c.code ? `${c.code} ` : ""}${c.title}`,
        }))}
        events={events.map((e) => ({
          id: e.id,
          label: `${formatDayKey(dateKeyOf(e.startsAt))} · ${e.title}`,
        }))}
      />
      <form action={deleteNoteAction} className="danger-zone">
        <input type="hidden" name="id" value={n.id} />
        <button type="submit" className="button secondary small">
          Delete note
        </button>
      </form>
    </main>
  );
}
