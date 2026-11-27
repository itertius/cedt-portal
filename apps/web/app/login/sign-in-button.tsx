"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

function ProviderSignInButton({
  provider,
  label,
  pendingLabel,
  disabled,
  secondary = false,
}: {
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
    const { error } = await authClient.signIn.social({ provider, callbackURL: "/" });
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
}: {
  disabled: boolean;
  secondary?: boolean;
}) {
  return (
    <ProviderSignInButton
      provider="mcv"
      label="Log in with MyCourseVille"
      pendingLabel="Redirecting to MyCourseVille…"
      disabled={disabled}
      secondary={secondary}
    />
  );
}

export function CedtSignInButton({ disabled }: { disabled: boolean }) {
  return (
    <ProviderSignInButton
      provider="cedt"
      label="Log in with CEDT"
      pendingLabel="Redirecting to CEDT…"
      disabled={disabled}
    />
  );
}
