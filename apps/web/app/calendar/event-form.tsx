"use client";

import { useActionState, useState } from "react";
import { type EventFormState, saveEventAction } from "./actions";

export interface EventFormValues {
  id?: string;
  title: string;
  date: string;
  endDate: string;
  start: string;
  end: string;
  allDay: boolean;
  location: string;
  description: string;
  courseId: string;
}

export function EventForm({
  values,
  courses,
  submitLabel,
}: {
  values: EventFormValues;
  courses: { id: string; code: string | null; title: string }[];
  submitLabel: string;
}) {
  const [state, action, pending] = useActionState<EventFormState, FormData>(saveEventAction, {});
  const [allDay, setAllDay] = useState(values.allDay);
  const err = (k: string) =>
    state.errors?.[k] ? (
      <span className="error" role="alert">
        {state.errors[k]}
      </span>
    ) : null;

  return (
    <form action={action} className="form">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      {err("form")}
      <label>
        Title
        <input name="title" defaultValue={values.title} required maxLength={200} />
        {err("title")}
      </label>
      <label className="check">
        <input
          type="checkbox"
          name="allDay"
          checked={allDay}
          onChange={(e) => setAllDay(e.currentTarget.checked)}
        />
        All day
      </label>
      <div className="row">
        <label>
          {allDay ? "From" : "Date"}
          <input type="date" name="date" defaultValue={values.date} required />
          {err("date")}
        </label>
        {allDay ? null : (
          <>
            <label>
              Start
              <input type="time" name="start" defaultValue={values.start} required />
              {err("start")}
            </label>
            <label>
              End
              <input type="time" name="end" defaultValue={values.end} required />
              {err("end")}
            </label>
          </>
        )}
        <label>
          {allDay ? "To" : "End date (optional)"}
          <input type="date" name="endDate" defaultValue={values.endDate} />
          {err("endDate")}
        </label>
      </div>
      <label>
        Course
        <select name="courseId" defaultValue={values.courseId}>
          <option value="">None</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code ? `${c.code} ` : ""}
              {c.title}
            </option>
          ))}
        </select>
      </label>
      <label>
        Location
        <input name="location" defaultValue={values.location} maxLength={200} />
      </label>
      <label>
        Notes
        <textarea name="description" defaultValue={values.description} rows={3} maxLength={5000} />
      </label>
      <div>
        <button type="submit" className="button" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}
