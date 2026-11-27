"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

function ProviderSignInButton({
  provider,
  label,
  pendingLabel,
  disabled,
  secondary = false,
  callbackURL = "/",
}: {
  callbackURL?: string;
  provider: string;
  label: string;
  pendingLabel: string;
  disabled: boolean;
  secondary?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL,
      // Rejected sign-ups (e.g. a Google account that is not invited) come back here.
      errorCallbackURL: "/login",
    });
    if (error) {
      setError(error.message ?? "Sign-in failed. Try again.");
      setPending(false);
    }
  }

  return (
    <div className="stack">
      <button
        type="button"
        className={secondary ? "button secondary" : "button"}
        onClick={signIn}
        disabled={disabled || pending}
      >
        {pending ? pendingLabel : label}
      </button>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function McvSignInButton({
  disabled,
  secondary,
  next,
}: {
  disabled: boolean;
  secondary?: boolean;
  next?: string;
}) {
  return (
    <ProviderSignInButton
      callbackURL={next}
      provider="mcv"
      label="Log in with MyCourseVille"
      pendingLabel="Redirecting to MyCourseVille…"
      disabled={disabled}
      secondary={secondary}
    />
  );
}

export function CedtSignInButton({ disabled, next }: { disabled: boolean; next?: string }) {
  return (
    <ProviderSignInButton
      callbackURL={next}
      provider="cedt"
      label="Log in with CEDT"
      pendingLabel="Redirecting to CEDT…"
      disabled={disabled}
    />
  );
}

export function GoogleSignInButton({
  disabled,
  secondary,
  next,
}: {
  disabled: boolean;
  secondary?: boolean;
  next?: string;
}) {
  return (
    <ProviderSignInButton
      callbackURL={next}
      provider="google"
      label="Log in with Google"
      pendingLabel="Redirecting to Google…"
      disabled={disabled}
      secondary={secondary}
    />
  );
}
