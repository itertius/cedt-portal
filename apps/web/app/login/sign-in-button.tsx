"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function McvSignInButton({ disabled }: { disabled: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.social({ provider: "mcv", callbackURL: "/" });
    if (error) {
      setError(error.message ?? "Sign-in failed. Try again.");
      setPending(false);
    }
  }

  return (
    <div className="stack">
      <button type="button" className="button" onClick={signIn} disabled={disabled || pending}>
        {pending ? "Redirecting to MyCourseVille…" : "Log in with MyCourseVille"}
      </button>
      {error ? (
        <p className="error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
