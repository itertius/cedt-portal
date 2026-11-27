import "server-only";
import { schema } from "@cedt-hub/db";
import { and, desc, eq, ilike, or, type SQL } from "@cedt-hub/db/orm";
import { z } from "zod";
import { getDb } from "../db";

const { course, event, note } = schema;

export const NOTE_LIMITS = { title: 200, body: 100_000 };

const isUuid = (id: unknown): id is string =>
  typeof id === "string" && z.uuid().safeParse(id).success;

export const noteInputSchema = z.object({
  title: z.string().max(NOTE_LIMITS.title, `Title is longer than ${NOTE_LIMITS.title} characters`),
  body: z.string().max(NOTE_LIMITS.body, "Note is too long (100,000 characters max)"),
  courseId: z.uuid().nullable(),
  eventId: z.uuid().nullable(),
  pinned: z.boolean(),
});
export type NoteInput = z.infer<typeof noteInputSchema>;

export function parseNoteForm(form: FormData) {
  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : "";
  };
  return noteInputSchema.safeParse({
    title: str("title").trim(),
    // Keep the body exactly as typed (markdown is whitespace-sensitive), only normalise newlines.
    body: str("body").replace(/\r\n/g, "\n"),
    courseId: str("courseId") || null,
    eventId: str("eventId") || null,
    pinned: form.get("pinned") === "on",
  });
}

/** Drop links to a course or event the user does not own. */
async function ownedLinks(userId: string, input: Pick<NoteInput, "courseId" | "eventId">) {
  const db = getDb();
  const [c] = input.courseId
    ? await db
        .select({ id: course.id })
        .from(course)
        .where(and(eq(course.id, input.courseId), eq(course.userId, userId)))
    : [];
  const [e] = input.eventId
    ? await db
        .select({ id: event.id })
        .from(event)
        .where(and(eq(event.id, input.eventId), eq(event.userId, userId)))
    : [];
  return { courseId: c?.id ?? null, eventId: e?.id ?? null };
}

export async function createNote(userId: string, input: Partial<NoteInput> = {}) {
  const links = await ownedLinks(userId, {
    courseId: input.courseId ?? null,
    eventId: input.eventId ?? null,
  });
  const [row] = await getDb()
    .insert(note)
    .values({
      userId,
      title: input.title ?? "",
      body: input.body ?? "",
      pinned: input.pinned ?? false,
      ...links,
    })
    .returning({ id: note.id });
  return row?.id as string;
}

/** Returns the new updatedAt, or null if the note does not exist for this user. */
export async function updateNote(userId: string, id: string, input: NoteInput) {
  if (!isUuid(id)) return null;
  const [row] = await getDb()
    .update(note)
    .set({
      title: input.title,
      body: input.body,
      pinned: input.pinned,
      ...(await ownedLinks(userId, input)),
    })
    .where(and(eq(note.id, id), eq(note.userId, userId)))
    .returning({ updatedAt: note.updatedAt });
  return row?.updatedAt ?? null;
}

export async function deleteNote(userId: string, id: string) {
  if (!isUuid(id)) return false;
  const rows = await getDb()
    .delete(note)
    .where(and(eq(note.id, id), eq(note.userId, userId)))
    .returning({ id: note.id });
  return rows.length > 0;
}

export async function getNote(userId: string, id: string) {
  if (!isUuid(id)) return null;
  const [row] = await getDb()
    .select()
    .from(note)
    .where(and(eq(note.id, id), eq(note.userId, userId)));
  return row ?? null;
}

/** Escape LIKE wildcards so a search for "100%" or "a_b" matches literally. */
export function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Plain-text preview of markdown for the list view. */
export function excerpt(body: string, max = 160) {
  const text = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~|-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export async function listNotes(
  userId: string,
  filters: { q?: string; courseId?: string; eventId?: string } = {},
) {
  const where: SQL[] = [eq(note.userId, userId)];
  const q = filters.q?.trim().slice(0, 100);
  if (q) {
    const pattern = likePattern(q);
    where.push(or(ilike(note.title, pattern), ilike(note.body, pattern)) as SQL);
  }
  if (isUuid(filters.courseId)) where.push(eq(note.courseId, filters.courseId));
  if (isUuid(filters.eventId)) where.push(eq(note.eventId, filters.eventId));

  const rows = await getDb()
    .select({
      id: note.id,
      title: note.title,
      body: note.body,
      pinned: note.pinned,
      updatedAt: note.updatedAt,
      courseId: note.courseId,
      courseCode: course.code,
      courseTitle: course.title,
      eventId: note.eventId,
      eventTitle: event.title,
    })
    .from(note)
    .leftJoin(course, eq(note.courseId, course.id))
    .leftJoin(event, eq(note.eventId, event.id))
    .where(and(...where))
    .orderBy(desc(note.pinned), desc(note.updatedAt))
    .limit(200);

  return rows.map(({ body, ...r }) => ({ ...r, excerpt: excerpt(body) }));
}

/** Events the user can attach a note to: their recent and upcoming ones. */
export async function linkableEvents(userId: string) {
  return getDb()
    .select({ id: event.id, title: event.title, startsAt: event.startsAt })
    .from(event)
    .where(eq(event.userId, userId))
    .orderBy(desc(event.startsAt))
    .limit(100);
}
