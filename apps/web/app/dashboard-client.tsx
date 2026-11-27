"use client";

import { useOptimistic, useState, useTransition } from "react";
import { syncNow, toggleTask } from "./actions";

export function SyncButton() {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <span className="inline">
      <button
        type="button"
        className="button secondary small"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await syncNow();
            setMessage(
              r.status === "error"
                ? r.error
                : r.status === "skipped"
                  ? r.reason === "running"
                    ? "A sync is already running."
                    : "Not connected to MyCourseVille."
                  : null,
            );
          })
        }
      >
        {pending ? "Syncing…" : "Sync now"}
      </button>
      {message ? <span className="error"> {message}</span> : null}
    </span>
  );
}

export function TaskCheckbox({ id, done, title }: { id: string; done: boolean; title: string }) {
  // Flip immediately; the server action confirms (or the page re-renders with the real state).
  const [optimisticDone, setOptimisticDone] = useOptimistic(done);
  const [pending, start] = useTransition();
  return (
    <input
      type="checkbox"
      aria-label={optimisticDone ? `Mark "${title}" as not done` : `Mark "${title}" as done`}
      checked={optimisticDone}
      aria-busy={pending}
      onChange={(e) => {
        const next = e.currentTarget.checked;
        start(async () => {
          setOptimisticDone(next);
          await toggleTask(id, next);
        });
      }}
    />
  );
}
