import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { getSession } from "@/lib/auth";
import { getEvent, listCourses } from "@/lib/calendar/events";
import { addDays, dateKeyOf, timeOf } from "@/lib/calendar/time";
import { deleteEventAction } from "../../actions";
import { EventForm } from "../../event-form";

export const dynamic = "force-dynamic";

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;

  const [ev, courses] = await Promise.all([
    getEvent(session.user.id, id),
    listCourses(session.user.id),
  ]);
  if (ev?.source !== "hub") notFound();

  const date = dateKeyOf(ev.startsAt);
  // All-day end is stored exclusive (next midnight); the form shows the inclusive last day.
  const endDate = ev.allDay ? addDays(dateKeyOf(ev.endsAt), -1) : dateKeyOf(ev.endsAt);

  return (
    <main className="shell wide">
      <Nav active="/calendar" />
      <p>
        <Link href={`/calendar?date=${date}`}>← Back to calendar</Link>
      </p>
      <section className="card">
        <h2>Edit event</h2>
        <EventForm
          submitLabel="Save"
          courses={courses}
          values={{
            id: ev.id,
            title: ev.title,
            date,
            endDate: endDate === date ? "" : endDate,
            start: timeOf(ev.startsAt),
            end: timeOf(ev.endsAt),
            allDay: ev.allDay,
            location: ev.location ?? "",
            description: ev.description ?? "",
            courseId: ev.courseId ?? "",
          }}
        />
      </section>
      <form action={deleteEventAction}>
        <input type="hidden" name="id" value={ev.id} />
        <input type="hidden" name="date" value={date} />
        <button type="submit" className="button secondary">
          Delete event
        </button>
      </form>
    </main>
  );
}
