export type Source = "mcv" | "hub" | "grader" | "talent" | "intern" | "nisitez" | "ices" | "gcal";

/** A course as every connector reports it. */
export interface NormalizedCourse {
  source: Source;
  sourceId: string;
  code: string | null;
  title: string;
  year: number | null;
  semester: number | null;
  role: string | null;
  url: string | null;
}

/** Anything with a deadline: assignments, grader problems, evaluations, application steps. */
export interface NormalizedTask {
  source: Source;
  sourceId: string;
  /** sourceId of the course this task belongs to, if any. */
  courseSourceId: string | null;
  title: string;
  dueAt: Date | null;
  url: string | null;
}
