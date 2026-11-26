import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { Nav } from "@/components/nav";
import { getSession } from "@/lib/auth";
import { type CalendarItem, listCalendar, listCourses } from "@/lib/calendar/events";
import {
  addDays,
  addMonths,
  type DateKey,
  dateKeyOf,
  formatDayKey,
  formatMonth,
  isDateKey,
  monthGrid,
  startOfDay,
  timeOf,
  todayKey,
  weekDays,
} from "@/lib/calendar/time";
import { GCAL_STALE_AFTER_MS, googleAccountId, syncGcal } from "@/lib/sync/gcal";
import { getSyncState } from "@/lib/sync/lock";
import { EventForm } from "./event-form";

export const dynamic = "force-dynamic";

type View = "week" | "month";

/** Every local day an item touches (an event can span several). */
function daysOf(item: CalendarItem): DateKey[] {
  const first = dateKeyOf(item.startsAt);
  if (item.kind === "task") return [first];
  // endsAt is exclusive: an event ending exactly at midnight does not touch the next day.
  const last = dateKeyOf(new Date(Math.max(item.startsAt.getTime(), item.endsAt.getTime() - 1)));
  const days: DateKey[] = [];
  for (let d = first; d <= last && days.length < 62; d = addDays(d, 1)) days.push(d);
  return days;
}

function groupByDay(items: CalendarItem[]) {
  const map = new Map<DateKey, CalendarItem[]>();
  for (const item of items) {
    for (const d of daysOf(item)) {
      const list = map.get(d) ?? [];
      list.push(item);
      map.set(d, list);
    }
  }
  return map;
}

function Item({ item }: { item: CalendarItem }) {
  const time = item.allDay
    ? "All day"
    : item.kind === "task"
      ? `Due ${timeOf(item.startsAt)}`
      : `${timeOf(item.startsAt)}–${timeOf(item.endsAt)}`;
  const label = (
    <>
      <span className="muted">{time}</span> {item.title}
      {item.courseCode ? <span className="muted"> · {item.courseCode}</span> : null}
    </>
  );
  const cls = `cal-item ${item.kind} source-${item.source}${item.done ? " done" : ""}`;
  if (item.kind === "event" && item.source === "hub") {
    return (
      <li className={cls}>
        <Link href={`/calendar/event/${item.id}`}>{label}</Link>
      </li>
    );
  }
  return (
    <li className={cls}>
      {item.url ? (
        <a href={item.url} target="_blank" rel="noreferrer">
          {label}
        </a>
      ) : (
        label
      )}
    </li>
  );
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; date?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const view: View = params.view === "month" ? "month" : "week";
  const today = todayKey();
  const anchor = isDateKey(params.date) ? params.date : today;

  const grid = view === "month" ? monthGrid(anchor) : [weekDays(anchor)];
  const firstDay = grid[0]?.[0] as DateKey;
  const lastDay = grid.at(-1)?.at(-1) as DateKey;

  const userId = session.user.id;
  const [items, courses, googleLinked, gcalState] = await Promise.all([
    listCalendar(userId, startOfDay(firstDay), startOfDay(addDays(lastDay, 1))),
    listCourses(userId),
    googleAccountId(userId),
    getSyncState(userId, "gcal"),
  ]);
  const gcalStale =
    !gcalState?.lastSyncedAt || Date.now() - gcalState.lastSyncedAt.getTime() > GCAL_STALE_AFTER_MS;
  if (googleLinked && gcalStale && gcalState?.status !== "running") {
    after(() => syncGcal(userId));
  }
  const byDay = groupByDay(items);

  const prev = view === "month" ? addMonths(anchor, -1) : addDays(anchor, -7);
  const next = view === "month" ? addMonths(anchor, 1) : addDays(anchor, 7);
  const href = (date: DateKey, v: View = view) => `/calendar?view=${v}&date=${date}`;
  const title =
    view === "month" ? formatMonth(anchor) : `${formatDayKey(firstDay)} – ${formatDayKey(lastDay)}`;

  return (
    <main className="shell wide">
      <Nav active="/calendar" />
      <header className="cal-header">
        <h1>{title}</h1>
        <div className="cal-controls">
          <Link className="button secondary small" href={href(prev)}>
            ← Prev
          </Link>
          <Link className="button secondary small" href={href(today)}>
            Today
          </Link>
          <Link className="button secondary small" href={href(next)}>
            Next →
          </Link>
          <Link
            className="button secondary small"
            href={href(anchor, view === "week" ? "month" : "week")}
          >
            {view === "week" ? "Month view" : "Week view"}
          </Link>
        </div>
      </header>

      <p className="muted small legend">
        <span className="swatch mcv" /> MCV deadline <span className="swatch hub" /> Your event{" "}
        <span className="swatch gcal" /> Google Calendar ·{" "}
        {googleLinked ? (
          gcalState?.status === "error" ? (
            <Link href="/settings" className="error">
              Google sync problem — see Settings
            </Link>
          ) : (
            "Synced with Google Calendar"
          )
        ) : (
          <Link href="/settings">Connect Google Calendar</Link>
        )}
      </p>

      <div className={`cal-grid ${view}`}>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="cal-dow">
            {d}
          </div>
        ))}
        {grid.flat().map((day) => {
          const list = byDay.get(day) ?? [];
          const outside = view === "month" && day.slice(0, 7) !== anchor.slice(0, 7);
          const shown = view === "month" ? list.slice(0, 3) : list;
          return (
            <section
              key={day}
              className={`cal-day${day === today ? " today" : ""}${outside ? " outside" : ""}`}
              aria-label={formatDayKey(day)}
            >
              <Link className="cal-date" href={href(day, "week")}>
                {view === "week" ? formatDayKey(day) : Number(day.slice(8))}
              </Link>
              <ul>
                {shown.map((item) => (
                  <Item key={`${item.kind}-${item.id}-${day}`} item={item} />
                ))}
              </ul>
              {list.length > shown.length ? (
                <Link className="muted small" href={href(day, "week")}>
                  +{list.length - shown.length} more
                </Link>
              ) : null}
            </section>
          );
        })}
      </div>

      <section className="card">
        <h2>Add event</h2>
        <EventForm
          submitLabel="Add event"
          courses={courses}
          values={{
            title: "",
            date: anchor,
            endDate: "",
            start: "19:00",
            end: "20:00",
            allDay: false,
            location: "",
            description: "",
            courseId: "",
          }}
        />
      </section>
    </main>
  );
}
