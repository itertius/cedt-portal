import { describe, expect, it } from "vitest";
import {
  currentTermCourses,
  normalizeAssignments,
  normalizeCourses,
  parseDueTime,
} from "./normalize";

const courses = normalizeCourses({
  data: {
    student: [
      { cv_cid: 101, course_no: "2110101", title: "Comp Eng Ess", year: 2026, semester: 2 },
      { cv_cid: "90", course_no: "2301107", title: "Calculus I", year: "2026", semester: "1" },
      { cv_cid: 101, title: "duplicate is dropped" },
      { title: "no id is dropped" },
    ],
    ta: [{ cv_cid: 55, course_no: "2110211", year: 2026, semester: 2 }],
  },
});

describe("normalizeCourses", () => {
  it("normalizes ids, numbers and roles", () => {
    expect(courses).toHaveLength(3);
    expect(courses[0]).toEqual({
      source: "mcv",
      sourceId: "101",
      code: "2110101",
      title: "Comp Eng Ess",
      year: 2026,
      semester: 2,
      role: "student",
      url: "https://www.mycourseville.com/?q=courseville/course/101",
    });
    expect(courses[1]?.semester).toBe(1);
    expect(courses[2]).toMatchObject({ sourceId: "55", title: "2110211", role: "ta" });
  });

  it("handles an empty or missing body", () => {
    expect(normalizeCourses({})).toEqual([]);
  });
});

describe("currentTermCourses", () => {
  it("keeps only the latest year + semester", () => {
    expect(currentTermCourses(courses).map((c) => c.sourceId)).toEqual(["101", "55"]);
  });

  it("returns everything when no course has a term", () => {
    const noTerm = normalizeCourses({ data: { student: [{ cv_cid: 1 }] } });
    expect(currentTermCourses(noTerm)).toEqual(noTerm);
  });
});

describe("parseDueTime", () => {
  it("reads unix seconds", () => {
    expect(parseDueTime("1798761600")?.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
  it("accepts milliseconds", () => {
    expect(parseDueTime(1798761600000)?.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
  it("treats 0, empty and junk as no deadline", () => {
    expect(parseDueTime(0)).toBeNull();
    expect(parseDueTime("")).toBeNull();
    expect(parseDueTime("soon")).toBeNull();
  });
});

describe("normalizeAssignments", () => {
  it("maps assignments with deep links", () => {
    const tasks = normalizeAssignments("101", {
      data: [
        { itemid: 7, title: "HW1", duetime: 1798761600 },
        { itemid: "8", duetime: 0 },
        { title: "no id" },
      ],
    });
    expect(tasks).toEqual([
      {
        source: "mcv",
        sourceId: "7",
        courseSourceId: "101",
        title: "HW1",
        dueAt: new Date("2027-01-01T00:00:00.000Z"),
        url: "https://www.mycourseville.com/?q=courseville/worksheet/101/7",
      },
      {
        source: "mcv",
        sourceId: "8",
        courseSourceId: "101",
        title: "Assignment 8",
        dueAt: null,
        url: "https://www.mycourseville.com/?q=courseville/worksheet/101/8",
      },
    ]);
  });
});
