import type { NormalizedCourse, NormalizedTask } from "../types";
import { mcvLinks } from "./api";

type Scalar = string | number | null | undefined;

export interface McvCourse {
  cv_cid?: Scalar;
  course_no?: Scalar;
  title?: Scalar;
  year?: Scalar;
  semester?: Scalar;
  section?: Scalar;
  role?: Scalar;
}

export interface McvCoursesResponse {
  data?: { student?: McvCourse[]; ta?: McvCourse[]; instructor?: McvCourse[] };
}

export interface McvAssignment {
  itemid?: Scalar;
  cv_cid?: Scalar;
  title?: Scalar;
  /** Unix time in seconds. 0 or empty means no deadline. */
  duetime?: Scalar;
}

export interface McvAssignmentsResponse {
  data?: McvAssignment[];
}

const str = (v: Scalar): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
};

const int = (v: Scalar): number | null => {
  const s = str(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : null;
};

export function normalizeCourses(body: McvCoursesResponse): NormalizedCourse[] {
  const groups: [string, McvCourse[] | undefined][] = [
    ["student", body.data?.student],
    ["ta", body.data?.ta],
    ["instructor", body.data?.instructor],
  ];
  const seen = new Map<string, NormalizedCourse>();
  for (const [role, list] of groups) {
    for (const c of list ?? []) {
      const id = str(c.cv_cid);
      if (!id || seen.has(id)) continue;
      seen.set(id, {
        source: "mcv",
        sourceId: id,
        code: str(c.course_no),
        title: str(c.title) ?? str(c.course_no) ?? `Course ${id}`,
        year: int(c.year),
        semester: int(c.semester),
        role: str(c.role) ?? role,
        url: mcvLinks.course(id),
      });
    }
  }
  return [...seen.values()];
}

/** Courses from the most recent academic year + semester only. */
export function currentTermCourses(courses: NormalizedCourse[]): NormalizedCourse[] {
  let best: [number, number] | null = null;
  for (const c of courses) {
    if (c.year === null || c.semester === null) continue;
    if (!best || c.year > best[0] || (c.year === best[0] && c.semester > best[1])) {
      best = [c.year, c.semester];
    }
  }
  if (!best) return courses;
  const [y, s] = best;
  return courses.filter((c) => c.year === y && c.semester === s);
}

export function parseDueTime(v: Scalar): Date | null {
  const n = int(v);
  if (n === null || n <= 0) return null;
  // MCV sends seconds; accept milliseconds too in case that ever changes.
  return new Date(n < 1e12 ? n * 1000 : n);
}

export function normalizeAssignments(
  cvCid: string,
  body: McvAssignmentsResponse,
): NormalizedTask[] {
  const out: NormalizedTask[] = [];
  for (const a of body.data ?? []) {
    const itemId = str(a.itemid);
    if (!itemId) continue;
    out.push({
      source: "mcv",
      sourceId: itemId,
      courseSourceId: str(a.cv_cid) ?? cvCid,
      title: str(a.title) ?? `Assignment ${itemId}`,
      dueAt: parseDueTime(a.duetime),
      url: mcvLinks.assignment(cvCid, itemId),
    });
  }
  return out;
}
