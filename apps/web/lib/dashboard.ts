import "server-only";
import { schema } from "@cedt-hub/db";
import { and, asc, desc, eq, gte, isNull, or } from "@cedt-hub/db/orm";
import { getDb } from "./db";
import { graderSummary } from "./sync/grader";
import { bookmarkedInternships, internshipCount } from "./sync/intern";
import { upcomingTalentActivities } from "./sync/talent";

const { course, syncState, task } = schema;

export interface DashboardTask {
  id: string;
  title: string;
  dueAt: Date | null;
  url: string | null;
  source: string;
  courseCode: string | null;
  courseTitle: string | null;
  completedAt: Date | null;
}

const DAY = 24 * 60 * 60 * 1000;

export async function getDashboard(userId: string, now = new Date()) {
  const db = getDb();

  const taskFields = {
    id: task.id,
    title: task.title,
    dueAt: task.dueAt,
    url: task.url,
    source: task.source,
    courseCode: course.code,
    courseTitle: course.title,
    completedAt: task.completedAt,
  };

  const [open, done, courses, [sync], activities, grader, bookmarks, internships] =
    await Promise.all([
      // Open tasks: overdue up to 30 days back, everything ahead, and undated ones.
      db
        .select(taskFields)
        .from(task)
        .leftJoin(course, eq(task.courseId, course.id))
        .where(
          and(
            eq(task.userId, userId),
            isNull(task.completedAt),
            or(isNull(task.dueAt), gte(task.dueAt, new Date(now.getTime() - 30 * DAY))),
          ),
        )
        .orderBy(asc(task.dueAt)),
      db
        .select(taskFields)
        .from(task)
        .leftJoin(course, eq(task.courseId, course.id))
        .where(
          and(eq(task.userId, userId), gte(task.completedAt, new Date(now.getTime() - 7 * DAY))),
        )
        .orderBy(desc(task.completedAt))
        .limit(10),
      db
        .select({
          id: course.id,
          code: course.code,
          title: course.title,
          year: course.year,
          semester: course.semester,
          url: course.url,
        })
        .from(course)
        .where(eq(course.userId, userId))
        .orderBy(desc(course.year), desc(course.semester), asc(course.code)),
      db
        .select()
        .from(syncState)
        .where(and(eq(syncState.userId, userId), eq(syncState.source, "mcv"))),
      upcomingTalentActivities(5, now),
      graderSummary(userId),
      bookmarkedInternships(userId, 5),
      internshipCount(userId),
    ]);

  const latest = courses[0];
  const currentCourses = latest
    ? courses.filter((c) => c.year === latest.year && c.semester === latest.semester)
    : [];

  const overdue = open.filter((t) => t.dueAt && t.dueAt < now);
  const upcoming = open.filter((t) => t.dueAt && t.dueAt >= now);
  const undated = open.filter((t) => !t.dueAt);

  return {
    overdue,
    upcoming,
    undated,
    done,
    courses: currentCourses,
    term: latest?.year ? { year: latest.year, semester: latest.semester } : null,
    sync: sync ?? null,
    activities,
    grader,
    bookmarks,
    internships,
  };
}

export async function setTaskCompleted(userId: string, taskId: string, completed: boolean) {
  await getDb()
    .update(task)
    .set({ completedAt: completed ? new Date() : null })
    .where(and(eq(task.id, taskId), eq(task.userId, userId)));
}
