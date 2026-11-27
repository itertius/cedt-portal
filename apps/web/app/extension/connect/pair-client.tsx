"use client";

import { useEffect, useRef, useState } from "react";
import { approveExtensionAction } from "./actions";

type Phase = "detecting" | "missing" | "ready" | "pairing" | "paired" | "failed";

/** "Chrome on macOS" etc., so Settings can tell browsers apart. */
function browserLabel() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Brave/.test(ua)
      ? "Brave"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : "Browser";
  const os = /Mac OS X/.test(ua)
    ? "macOS"
    : /Windows/.test(ua)
      ? "Windows"
      : /Linux/.test(ua)
        ? "Linux"
        : "";
  return os ? `${browser} on ${os}` : browser;
}

export function PairClient({ state }: { state: string }) {
  const [phase, setPhase] = useState<Phase>("detecting");
  const [error, setError] = useState<string | null>(null);
  const resolvePair = useRef<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== window.location.origin) return;
      const d = e.data as { source?: string; type?: string; ok?: boolean };
      if (d?.source !== "cedt-hub-extension") return;
      if (d.type === "ready") setPhase((p) => (p === "detecting" || p === "missing" ? "ready" : p));
      if (d.type === "paired") resolvePair.current?.(Boolean(d.ok));
    };
    window.addEventListener("message", onMessage);
    // Ask the extension's page script to announce itself (it may have loaded before us).
    window.postMessage({ source: "cedt-hub", type: "hello" }, window.location.origin);
    const t = setTimeout(() => setPhase((p) => (p === "detecting" ? "missing" : p)), 2500);
    return () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(t);
    };
  }, []);

  async function approve() {
    setPhase("pairing");
    setError(null);
    const r = await approveExtensionAction(browserLabel());
    if ("error" in r) {
      setError(r.error ?? "Could not connect.");
      setPhase("failed");
      return;
    }
    const ok = await new Promise<boolean>((resolve) => {
      resolvePair.current = resolve;
      window.postMessage(
        { source: "cedt-hub", type: "pair", token: r.token, state },
        window.location.origin,
      );
      setTimeout(() => resolve(false), 8000);
    });
    setPhase(ok ? "paired" : "failed");
    if (!ok) setError("The extension did not confirm. Open it and click Connect again.");
  }

  if (phase === "paired") {
    return (
      <div className="stack">
        <p role="status">
          <strong>Connected.</strong> The extension will keep your Intern Portal session up to date.
          You can close this tab.
        </p>
      </div>
    );
  }
  if (phase === "missing") {
    return (
      <div className="stack">
        <p>The CEDT Hub extension was not found in this browser.</p>
        <p className="muted small">
          Install it, then click its icon and choose <strong>Connect to CEDT Hub</strong>. Setup
          steps are in the extension&apos;s README (apps/extension).
        </p>
      </div>
    );
  }
  return (
    <div className="stack">
      <p>
        The CEDT Hub extension in this browser wants to keep your <strong>Intern Portal</strong>{" "}
        session synced with your hub. It can only read cookies for cedtintern.cp.eng.chula.ac.th,
        and you can disconnect it any time in Settings.
      </p>
      <button
        type="button"
        className="button"
        onClick={approve}
        disabled={phase !== "ready" && phase !== "failed"}
      >
        {phase === "pairing"
          ? "Connecting…"
          : phase === "detecting"
            ? "Looking for the extension…"
            : "Allow"}
      </button>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
