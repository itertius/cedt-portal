"use client";

import { useActionState, useState, useTransition } from "react";
import {
  connectMcvAction,
  disconnectMcvAction,
  syncMcvNowAction,
  updateMcvPasswordAction,
} from "./mcv-actions";

function Status({ state }: { state: { ok?: string; error?: string } }) {
  if (state.error) {
    return (
      <p className="error" role="alert">
        {state.error}
      </p>
    );
  }
  return state.ok ? <p role="status">{state.ok}</p> : null;
}

export function McvConnectForm() {
  const [state, action, pending] = useActionState(connectMcvAction, {});
  return (
    <form action={action} className="form" autoComplete="off">
      <div className="row">
        <label>
          CUNET username
          <input
            name="username"
            required
            autoComplete="username"
            inputMode="numeric"
            placeholder="6933243721"
          />
        </label>
        <label>
          CUNET password
          <input name="password" type="password" required autoComplete="current-password" />
        </label>
      </div>
      <label className="check small">
        <input type="checkbox" name="consent" required /> I agree that CEDT Hub stores my CUNET
        password, encrypted, to log in to MyCourseVille for me.
      </label>
      <p className="muted small">
        The password is encrypted with a separate key and used only when your MyCourseVille session
        expires. If MyCourseVille rejects it, CEDT Hub stops trying until you update it, so it can
        never lock your account. Disconnecting deletes it.
      </p>
      <div>
        <button type="submit" className="button" disabled={pending}>
          {pending ? "Logging in to MyCourseVille…" : "Connect MyCourseVille"}
        </button>
      </div>
      <Status state={state} />
    </form>
  );
}

export function McvUpdatePasswordForm() {
  const [state, action, pending] = useActionState(updateMcvPasswordAction, {});
  return (
    <form action={action} className="form" autoComplete="off">
      <label>
        New CUNET password
        <input name="password" type="password" required autoComplete="current-password" />
      </label>
      <div>
        <button type="submit" className="button" disabled={pending}>
          {pending ? "Checking…" : "Update password"}
        </button>
      </div>
      <Status state={state} />
    </form>
  );
}

export function McvControls() {
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
            const r = await syncMcvNowAction();
            setMessage(
              r.status === "ok"
                ? `Synced ${r.tasks} pending items.`
                : r.status === "error"
                  ? r.error
                  : "A sync is already running.",
            );
          })
        }
      >
        {pending ? "Syncing…" : "Sync now"}
      </button>
      <button
        type="button"
        className="button secondary small"
        disabled={pending}
        onClick={() => {
          if (
            !confirm(
              "Disconnect MyCourseVille? Your saved CUNET password and MCV data are deleted.",
            )
          )
            return;
          start(() => disconnectMcvAction());
        }}
      >
        Disconnect
      </button>
      {message ? (
        <span className="muted" role="status">
          {message}
        </span>
      ) : null}
    </span>
  );
}
