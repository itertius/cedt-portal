"use client";

import { useState, useTransition } from "react";
import { authClient } from "@/lib/auth-client";
import { disconnectGoogle, syncGoogleNow } from "./actions";

export function ConnectGoogleButton({ label = "Connect Google Calendar" }: { label?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline">
      <button
        type="button"
        className="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const { error } = await authClient.linkSocial({
            provider: "google",
            callbackURL: "/settings",
          });
          if (error) {
            setError(error.message ?? "Could not start Google sign-in.");
            setPending(false);
          }
        }}
      >
        {pending ? "Opening Google…" : label}
      </button>
      {error ? (
        <span className="error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}

export function GoogleSyncControls() {
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
            const r = await syncGoogleNow();
            setMessage(
              r.status === "ok"
                ? `Synced: ${r.pushed} pushed, ${r.pulled} pulled, ${r.deleted} removed.`
                : r.status === "error"
                  ? r.error
                  : r.reason === "running"
                    ? "A sync is already running."
                    : "Google is not connected.",
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
              "Disconnect Google Calendar? Google events disappear from the hub; your hub events stay.",
            )
          )
            return;
          start(() => disconnectGoogle());
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

/** Link another login (e.g. CEDT) to the current account. */
export function LinkAccountButton({ provider, label }: { provider: string; label: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline">
      <button
        type="button"
        className="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const { error } = await authClient.linkSocial({ provider, callbackURL: "/settings" });
          if (error) {
            setError(error.message ?? "Could not start linking.");
            setPending(false);
          }
        }}
      >
        {pending ? "Redirecting…" : label}
      </button>
      {error ? (
        <span className="error" role="alert">
          {error}
        </span>
      ) : null}
    </span>
  );
}
