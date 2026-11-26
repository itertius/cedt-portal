import "server-only";
import { schema } from "@cedt-hub/db";
import { and, asc, eq, gt, gte, isNotNull, lt } from "@cedt-hub/db/orm";
import { z } from "zod";
import { getDb } from "../db";
import { addDays, isDateKey, localToInstant, startOfDay } from "./time";

const { course, event, task } = schema;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length > 0 ? v : null))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

/** What the event form submits. Dates/times are Bangkok local. */
export const eventInputSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required").max(200),
    date: z.string().refine(isDateKey, "Pick a valid date"),
    endDate: z.string().refine(isDateKey, "Pick a valid end date").optional(),
    allDay: z.boolean().default(false),
    start: z.string().optional(),
    end: z.string().optional(),
    location: optionalText(200),
    description: optionalText(5000),
    courseId: z.uuid().nullable().optional(),
  })
  .transform((v, ctx) => {
    const endDate = v.endDate ?? v.date;
    let startsAt: Date | null;
    let endsAt: Date | null;
    if (v.allDay) {
      startsAt = startOfDay(v.date);
      endsAt = startOfDay(addDays(endDate, 1)); // end date is inclusive
    } else {
      startsAt = localToInstant(v.date, v.start ?? "");
      endsAt = localToInstant(endDate, v.end ?? "");
      if (!startsAt)
        ctx.addIssue({ code: "custom", path: ["start"], message: "Pick a start time" });
      if (!endsAt) ctx.addIssue({ code: "custom", path: ["end"], message: "Pick an end time" });
    }
    if (startsAt && endsAt && endsAt <= startsAt) {
      ctx.addIssue({ code: "custom", path: ["end"], message: "End must be after start" });
    }
    if (!startsAt || !endsAt) return z.NEVER;
    return {
      title: v.title,
      allDay: v.allDay,
      startsAt,
      endsAt,
      location: v.location,
      description: v.description,
      courseId: v.courseId ?? null,
    };
  });

export type EventInput = z.output<typeof eventInputSchema>;

/** Read the event form. Returns field errors instead of throwing. */
export function parseEventForm(form: FormData) {
  const get = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : undefined;
  };
  return eventInputSchema.safeParse({
    title: get("title") ?? "",
    date: get("date") ?? "",
    endDate: get("endDate") || undefined,
    allDay: form.get("allDay") === "on",
    start: get("start"),
    end: get("end"),
    location: get("location"),
    description: get("description"),
    courseId: get("courseId") || null,
  });
}

const isUuid = (id: string) => z.uuid().safeParse(id).success;

/** Only courses the user owns may be attached. */
async function ownedCourseId(userId: string, courseId: string | null) {
  if (!courseId) return null;
  const [row] = await getDb()
    .select({ id: course.id })
    .from(course)
    .where(and(eq(course.id, courseId), eq(course.userId, userId)));
  return row?.id ?? null;
}

export async function createEvent(userId: string, input: EventInput) {
  const [row] = await getDb()
    .insert(event)
    .values({
      ...input,
      courseId: await ownedCourseId(userId, input.courseId),
      userId,
      source: "hub",
    })
    .returning({ id: event.id });
  return row?.id ?? null;
}

/** Updates a hub-created event the user owns. Returns false if there is no such event. */
export async function updateEvent(userId: string, id: string, input: EventInput) {
  if (!isUuid(id)) return false;
  const rows = await getDb()
    .update(event)
    .set({ ...input, courseId: await ownedCourseId(userId, input.courseId) })
    .where(and(eq(event.id, id), eq(event.userId, userId), eq(event.source, "hub")))
    .returning({ id: event.id });
  return rows.length > 0;
}

export async function deleteEvent(userId: string, id: string) {
  if (!isUuid(id)) return false;
  const rows = await getDb()
    .delete(event)
    .where(and(eq(event.id, id), eq(event.userId, userId), eq(event.source, "hub")))
    .returning({ id: event.id });
  return rows.length > 0;
}

export async function getEvent(userId: string, id: string) {
  if (!isUuid(id)) return null;
  const [row] = await getDb()
    .select()
    .from(event)
    .where(and(eq(event.id, id), eq(event.userId, userId)));
  return row ?? null;
}

export interface CalendarItem {
  kind: "event" | "task";
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  source: string;
  courseCode: string | null;
  url: string | null;
  done: boolean;
}

/** Events overlapping [from, to) plus task deadlines inside it, sorted by start. */
export async function listCalendar(userId: string, from: Date, to: Date): Promise<CalendarItem[]> {
  const db = getDb();
  const [events, tasks] = await Promise.all([
    db
      .select({
        id: event.id,
        title: event.title,
        startsAt: event.startsAt,
        endsAt: event.endsAt,
        allDay: event.allDay,
        source: event.source,
        courseCode: course.code,
        url: event.url,
      })
      .from(event)
      .leftJoin(course, eq(event.courseId, course.id))
      .where(and(eq(event.userId, userId), lt(event.startsAt, to), gt(event.endsAt, from)))
      .orderBy(asc(event.startsAt)),
    db
      .select({
        id: task.id,
        title: task.title,
        dueAt: task.dueAt,
        source: task.source,
        courseCode: course.code,
        url: task.url,
        completedAt: task.completedAt,
      })
      .from(task)
      .leftJoin(course, eq(task.courseId, course.id))
      .where(
        and(
          eq(task.userId, userId),
          isNotNull(task.dueAt),
          gte(task.dueAt, from),
          lt(task.dueAt, to),
        ),
      )
      .orderBy(asc(task.dueAt)),
  ]);

  const items: CalendarItem[] = [
    ...events.map((e) => ({ kind: "event" as const, ...e, done: false })),
    ...tasks.map((t) => ({
      kind: "task" as const,
      id: t.id,
      title: t.title,
      startsAt: t.dueAt as Date,
      endsAt: t.dueAt as Date,
      allDay: false,
      source: t.source,
      courseCode: t.courseCode,
      url: t.url,
      done: t.completedAt !== null,
    })),
  ];
  return items.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
}

export async function listCourses(userId: string) {
  return getDb()
    .select({ id: course.id, code: course.code, title: course.title })
    .from(course)
    .where(eq(course.userId, userId))
    .orderBy(asc(course.code));
}
