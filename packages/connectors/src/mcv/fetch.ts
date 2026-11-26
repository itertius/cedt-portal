import type { NormalizedCourse, NormalizedTask } from "../types";
import { type McvApiError, mcvGet, mcvUrls } from "./api";
import {
  currentTermCourses,
  type McvAssignmentsResponse,
  type McvCoursesResponse,
  normalizeAssignments,
  normalizeCourses,
} from "./normalize";

export interface McvSnapshot {
  courses: NormalizedCourse[];
  tasks: NormalizedTask[];
  /** sourceIds of courses whose assignment list was fetched successfully (it is complete). */
  fetchedCourses: string[];
  /** Courses whose assignments could not be fetched. */
  failedCourses: { sourceId: string; error: string }[];
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i] as T);
    }
  });
  await Promise.all(workers);
  return results;
}

/** Pull courses (all terms) and assignments (current term only) for one user. */
export async function fetchMcvSnapshot(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<McvSnapshot> {
  const urls = mcvUrls();
  const courses = normalizeCourses(
    await mcvGet<McvCoursesResponse>(urls.courses, accessToken, fetchImpl),
  );

  const failedCourses: McvSnapshot["failedCourses"] = [];
  const fetchedCourses: string[] = [];
  const perCourse = await mapLimit(currentTermCourses(courses), 4, async (c) => {
    try {
      const body = await mcvGet<McvAssignmentsResponse>(
        urls.assignments(c.sourceId),
        accessToken,
        fetchImpl,
      );
      fetchedCourses.push(c.sourceId);
      return normalizeAssignments(c.sourceId, body);
    } catch (err) {
      failedCourses.push({ sourceId: c.sourceId, error: (err as McvApiError).message });
      return [];
    }
  });

  return { courses, tasks: perCourse.flat(), fetchedCourses, failedCourses };
}
