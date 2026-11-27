"use client";

import { useActionState, useState, useTransition } from "react";
import {
  type ConnectState,
  connectGraderAction,
  connectInternAction,
  disconnectConnectorAction,
  syncConnectorAction,
} from "./connector-actions";

function Status({ state }: { state: ConnectState }) {
  if (state.error) {
    return (
      <p className="error" role="alert">
        {state.error}
      </p>
    );
  }
  return state.ok ? <p role="status">{state.ok}</p> : null;
}

export function GraderConnectForm({ reconnect = false }: { reconnect?: boolean }) {
  const [state, action, pending] = useActionState(connectGraderAction, {});
  return (
    <form action={action} className="form" autoComplete="off">
      <div className="row">
        <label>
          Grader login
          <input name="login" required autoComplete="username" />
        </label>
        <label>
          Grader password
          <input name="password" type="password" required autoComplete="current-password" />
        </label>
      </div>
      <p className="muted small">
        Your password goes to the grader once to get a 12-hour access token. CEDT Hub keeps only
        that token (encrypted) and never stores your password.
      </p>
      <div>
        <button type="submit" className="button" disabled={pending}>
          {pending ? "Connecting…" : reconnect ? "Reconnect Grader" : "Connect Grader"}
        </button>
      </div>
      <Status state={state} />
    </form>
  );
}

export function InternConnectForm({ reconnect = false }: { reconnect?: boolean }) {
  const [state, action, pending] = useActionState(connectInternAction, {});
  return (
    <form action={action} className="form" autoComplete="off">
      <details>
        <summary>How do I get my cookie?</summary>
        <ol className="small">
          <li>Open the CEDT Intern Portal in Chrome and log in.</li>
          <li>Press F12 (or ⌥⌘I), open the Network tab, then reload the page.</li>
          <li>
            Click any request to cedtintern.cp.eng.chula.ac.th, find Request Headers → Cookie.
          </li>
          <li>Copy the whole Cookie value and paste it below.</li>
        </ol>
      </details>
      <label>
        Intern Portal cookie
        <textarea
          name="cookie"
          rows={3}
          required
          spellCheck={false}
          placeholder="name=value; name2=value2"
        />
      </label>
      <p className="muted small">
        The cookie is checked against the Intern Portal, then stored encrypted. It only lets CEDT
        Hub read your openings, bookmarks and deadlines. Disconnect any time.
      </p>
      <div>
        <button type="submit" className="button" disabled={pending}>
          {pending ? "Checking…" : reconnect ? "Update cookie" : "Connect Intern Portal"}
        </button>
      </div>
      <Status state={state} />
    </form>
  );
}

export function ConnectorControls({
  source,
  label,
}: {
  source: "grader" | "intern";
  label: string;
}) {
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
            const r = await syncConnectorAction(source);
            setMessage(
              r.status === "ok"
                ? "Synced."
                : r.status === "error"
                  ? r.error
                  : r.reason === "running"
                    ? "A sync is already running."
                    : "Not connected.",
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
          if (!confirm(`Disconnect ${label}? Its data is removed from CEDT Hub.`)) return;
          start(() => disconnectConnectorAction(source));
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
