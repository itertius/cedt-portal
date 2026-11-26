import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  dateKeyOf,
  isDateKey,
  localToInstant,
  monthGrid,
  startOfDay,
  startOfWeek,
  timeOf,
  weekDays,
  weekdayOf,
} from "./time";

describe("Bangkok local time", () => {
  it("converts instants to local days and times (UTC+7)", () => {
    const d = new Date("2026-12-01T18:30:00Z"); // 01:30 on Dec 2 in Bangkok
    expect(dateKeyOf(d)).toBe("2026-12-02");
    expect(timeOf(d)).toBe("01:30");
  });

  it("converts local date + time to an instant", () => {
    expect(localToInstant("2026-12-02", "01:30")?.toISOString()).toBe("2026-12-01T18:30:00.000Z");
    expect(startOfDay("2026-12-02").toISOString()).toBe("2026-12-01T17:00:00.000Z");
  });

  it("rejects bad input", () => {
    expect(localToInstant("2026-02-30", "10:00")).toBeNull();
    expect(localToInstant("2026-12-02", "24:00")).toBeNull();
    expect(localToInstant("not-a-date", "10:00")).toBeNull();
    expect(isDateKey("2026-13-01")).toBe(false);
    expect(isDateKey("2028-02-29")).toBe(true);
  });
});

describe("day arithmetic", () => {
  it("adds days and months across boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-01");
    expect(addMonths("2026-01-31", -1)).toBe("2025-12-01");
  });

  it("weeks start on Monday", () => {
    expect(weekdayOf("2026-11-30")).toBe(0); // Monday
    expect(weekdayOf("2026-12-06")).toBe(6); // Sunday
    expect(startOfWeek("2026-12-06")).toBe("2026-11-30");
    expect(weekDays("2026-12-02")).toEqual([
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
      "2026-12-03",
      "2026-12-04",
      "2026-12-05",
      "2026-12-06",
    ]);
  });

  it("month grid is 6 Monday-first weeks covering the month", () => {
    const grid = monthGrid("2026-12-20");
    expect(grid).toHaveLength(6);
    expect(grid.every((w) => w.length === 7)).toBe(true);
    expect(grid[0]?.[0]).toBe("2026-11-30");
    expect(grid.flat()).toContain("2026-12-31");
    expect(grid.flat().every((k) => weekdayOf(k) === grid.flat().indexOf(k) % 7)).toBe(true);
  });
});
