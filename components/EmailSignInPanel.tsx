"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { SpotifyGateButton } from "@/components/SignInChooser";
import type { AuthFeatureFlags } from "@/lib/auth-flags";

type EmailState = { kind: "idle" | "notice" | "success" | "error"; message: string };

/**
 * Email-first sign-in panel, factored out of ListenerProfileButton so the curator apply +
 * recommend flows offer the same magic-link path the listener profile does (PRD 34). Email is
 * primary; Spotify is an optional secondary. Each entry point passes its own `callbackUrl` so the
 * listener returns to where they started. Degrades gracefully: if email isn't configured it shows
 * Spotify alone; if neither is on it explains sign-in is unavailable.
 */
export function EmailSignInPanel({
  callbackUrl,
  features,
  description,
}: {
  callbackUrl: string;
  features: AuthFeatureFlags;
  description?: string;
}) {
  const [email, setEmail] = useState("");
  const [emailState, setEmailState] = useState<EmailState>({ kind: "idle", message: "" });

  async function sendEmailLink() {
    const trimmed = email.trim();
    if (!trimmed) {
      return;
    }
    setEmailState({ kind: "notice", message: "Sending your sign-in link…" });

    try {
      const result = (await signIn("resend", {
        email: trimmed,
        redirect: false,
        callbackUrl,
      })) as { error?: string } | undefined;

      if (result?.error) {
        throw new Error(result.error);
      }
      setEmailState({
        kind: "success",
        message:
          "Check your inbox for a one-tap sign-in link from avlmc@agent828.com — it may take a minute, and check your spam folder if you don't see it.",
      });
    } catch {
      setEmailState({ kind: "error", message: "Could not send the link. Try again in a moment." });
    }
  }

  if (!features.email && !features.spotify) {
    return <p className="form-message notice">Sign-in is temporarily unavailable. Check back soon.</p>;
  }

  return (
    <div className="listener-onboarding">
      {description ? <p className="listener-onboarding-copy">{description}</p> : null}

      {features.email ? (
        <div className="listener-email-signin">
          <label htmlFor="curator-email">Sign in with email</label>
          <div className="listener-email-row">
            <input
              autoComplete="email"
              id="curator-email"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void sendEmailLink();
                }
              }}
              placeholder="you@example.com"
              type="email"
              value={email}
            />
            <button
              className="primary-action"
              disabled={!email.trim() || emailState.kind === "notice"}
              onClick={() => void sendEmailLink()}
              type="button"
            >
              Email me a link
            </button>
          </div>
          <small>We&apos;ll email you a one-tap sign-in link. No password to remember.</small>
          {emailState.message ? (
            <p className={`form-message ${emailState.kind}`}>{emailState.message}</p>
          ) : null}
        </div>
      ) : null}

      {features.spotify ? (
        <div className="listener-spotify-optional">
          {/* Gated (PRD 43): seated testers pass straight through; everyone else is caught here. */}
          <SpotifyGateButton callbackUrl={callbackUrl} className="ghost-control" source="email-signin-panel">
            {features.email ? "Or continue with Spotify" : "Continue with Spotify"}
          </SpotifyGateButton>
        </div>
      ) : null}
    </div>
  );
}
