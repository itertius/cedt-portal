/**
 * Calendar date math in Asia/Bangkok. Thailand has no daylight saving, so local time is always
 * UTC+7; that keeps this exact without a timezone library. Days are passed around as "YYYY-MM-DD"
 * keys in local time.
 */
export const TZ = "Asia/Bangkok";
const OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type DateKey = string;

const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isDateKey(v: unknown): v is DateKey {
  if (typeof v !== "string") return false;
  const m = KEY_RE.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === v;
}

/** Local calendar day of an instant. */
export function dateKeyOf(d: Date): DateKey {
  return new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}

/** "HH:MM" local time of an instant. */
export function timeOf(d: Date): string {
  return new Date(d.getTime() + OFFSET_MS).toISOString().slice(11, 16);
}

/** Midnight local time at the start of a day, as an instant. */
export function startOfDay(key: DateKey): Date {
  return new Date(Date.parse(`${key}T00:00:00Z`) - OFFSET_MS);
}

/** Local date + "HH:MM" to an instant. Returns null for invalid input. */
export function localToInstant(key: string, time: string): Date | null {
  if (!isDateKey(key)) return null;
  const m = TIME_RE.exec(time);
  if (!m) return null;
  return new Date(startOfDay(key).getTime() + (Number(m[1]) * 60 + Number(m[2])) * 60_000);
}

export function addDays(key: DateKey, n: number): DateKey {
  return new Date(Date.parse(`${key}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

export function addMonths(key: DateKey, n: number): DateKey {
  const [y, m] = key.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

/** 0 = Monday ... 6 = Sunday. */
export function weekdayOf(key: DateKey): number {
  return (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** Monday of the week containing `key`. */
export function startOfWeek(key: DateKey): DateKey {
  return addDays(key, -weekdayOf(key));
}

export function weekDays(key: DateKey): DateKey[] {
  const start = startOfWeek(key);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** 6 weeks x 7 days covering the month of `key`, starting on a Monday. */
export function monthGrid(key: DateKey): DateKey[][] {
  const first = `${key.slice(0, 7)}-01`;
  const start = startOfWeek(first);
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)),
  );
}

export function todayKey(now = new Date()): DateKey {
  return dateKeyOf(now);
}

const longDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
});
const monthYear = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  month: "long",
  year: "numeric",
});

export function formatDayKey(key: DateKey): string {
  return longDay.format(new Date(`${key}T00:00:00Z`));
}

export function formatMonth(key: DateKey): string {
  return monthYear.format(new Date(`${key}T00:00:00Z`));
}
