"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { type SaveNoteState, saveNoteAction } from "./actions";
import { Markdown } from "./markdown";

interface Option {
  id: string;
  label: string;
}

export function NoteEditor({
  note,
  courses,
  events,
}: {
  note: {
    id: string;
    title: string;
    body: string;
    courseId: string;
    eventId: string;
    pinned: boolean;
  };
  courses: Option[];
  events: Option[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, submitting] = useActionState<SaveNoteState, FormData>(
    saveNoteAction,
    {},
  );
  const [autoState, setAutoState] = useState<SaveNoteState>({});
  const [saving, startSave] = useTransition();
  const [dirty, setDirty] = useState(false);
  const [body, setBody] = useState(note.body);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const status =
    autoState.savedAt && (!state.savedAt || autoState.savedAt > state.savedAt) ? autoState : state;

  const save = () => {
    if (!formRef.current) return;
    const data = new FormData(formRef.current);
    startSave(async () => {
      const r = await saveNoteAction({}, data);
      setAutoState(r);
      if (!r.error) setDirty(false);
    });
  };

  // Autosave 1s after the last change.
  const changed = () => {
    setDirty(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, 1000);
  };

  // Cmd/Ctrl+S saves now; warn before leaving with unsaved changes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        save();
      }
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onLeave);
    };
  });

  const label = saving
    ? "Saving…"
    : status.error
      ? status.error
      : dirty
        ? "Unsaved changes"
        : status.savedAt
          ? `Saved ${new Date(status.savedAt).toLocaleTimeString("en-GB", { timeZone: "Asia/Bangkok" })}`
          : "";

  return (
    <form ref={formRef} action={formAction} className="form note-editor" onChange={changed}>
      <input type="hidden" name="id" value={note.id} />
      <input
        name="title"
        className="note-title"
        defaultValue={note.title}
        placeholder="Untitled note"
        maxLength={200}
        aria-label="Title"
      />
      <div className="row">
        <label>
          Course
          <select name="courseId" defaultValue={note.courseId}>
            <option value="">None</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Event
          <select name="eventId" defaultValue={note.eventId}>
            <option value="">None</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" name="pinned" defaultChecked={note.pinned} /> Pinned
        </label>
      </div>

      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "write"}
          onClick={() => setTab("write")}
        >
          Write
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "preview"}
          onClick={() => setTab("preview")}
        >
          Preview
        </button>
      </div>
      <textarea
        name="body"
        value={body}
        onChange={(e) => setBody(e.currentTarget.value)}
        rows={18}
        maxLength={100_000}
        placeholder="Write in Markdown: # headings, - lists, **bold**, `code`, [links](https://…)"
        aria-label="Note"
        hidden={tab !== "write"}
      />
      {tab === "preview" ? (
        body.trim() ? (
          <Markdown>{body}</Markdown>
        ) : (
          <p className="muted">Nothing to preview.</p>
        )
      ) : null}

      <div className="inline">
        <button type="submit" className="button" disabled={submitting || saving}>
          Save
        </button>
        <span className={status.error ? "error" : "muted"} role="status">
          {label}
        </span>
      </div>
    </form>
  );
}
