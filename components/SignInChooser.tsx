"use client";

import { useEffect, useState, type ReactNode } from "react";
import { signIn } from "next-auth/react";
import { X } from "lucide-react";
import { TesterRequestForm } from "@/components/TesterRequestForm";

/**
 * The sign-in chooser & pre-redirect Spotify gate (PRD 43 / Phase 17).
 *
 * Spotify Development Mode 403s non-allowlisted users on SPOTIFY'S OWN domain — before any
 * callback — so the tester offer has to live at the exact moment Spotify intent is expressed.
 * This module is the ONLY place `signIn("spotify")` may appear (guard-tested): every surface
 * routes through the gate, which passes seated testers straight to Spotify and catches everyone
 * else with the tester-request form before they can be stranded.
 *
 * Exports:
 *  - `SignInChooser` — the three-door panel (Spotify / email / request access), also rendered
 *    full-page as the custom `pages.signIn` (`app/auth/signin`).
 *  - `SignInChooserModal` + `useSignInChooser` — the in-page modal shell for action nudges
 *    (save/follow/keep-intent) that today would fire a blind Spotify redirect.
 *  - `SpotifyGateButton` — a gated "Continue with Spotify" button for Spotify-specific spots
 *    (profile connect, error-page retry, access-request retry).
 *
 * With `SPOTIFY_OPEN_ACCESS=true` (PRD 45 flag flip) the config says `openAccess` and the gate
 * short-circuits: straight to Spotify, no check, no "Request access" door.
 */

type GateConfig = {
  openAccess: boolean;
  spotifyEnabled: boolean;
  emailEnabled: boolean;
  googleEnabled: boolean;
};
type GateOutcome = "allowed" | "pending" | "declined" | "not_found" | "email_required";
type GateResult = { outcome: GateOutcome; email?: string; error?: string };

const REMEMBERED_EMAIL_KEY = "avlmc-spotify-gate-email";

// One config fetch per page load, shared by every chooser/gate instance.
let configPromise: Promise<GateConfig> | null = null;

function fetchGateConfig(): Promise<GateConfig> {
  configPromise ??= fetch("/api/spotify-gate", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`Gate config failed (${response.status}).`);
      return response.json() as Promise<GateConfig>;
    })
    .catch(() => {
      configPromise = null;
      // Degrade to the gated posture — never to an ungated redirect.
      return { openAccess: false, spotifyEnabled: true, emailEnabled: true, googleEnabled: false };
    });
  return configPromise;
}

async function checkGate(email: string | undefined): Promise<GateResult> {
  try {
    const response = await fetch("/api/spotify-gate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = (await response.json()) as GateResult;
    if (!response.ok) {
      return { outcome: email ? "not_found" : "email_required", email, error: data.error };
    }
    return data;
  } catch {
    return { outcome: email ? "not_found" : "email_required", email };
  }
}

function getRememberedEmail(): string {
  try {
    return window.localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? "";
  } catch {
    return "";
  }
}

function rememberEmail(email: string | undefined) {
  try {
    if (email) window.localStorage.setItem(REMEMBERED_EMAIL_KEY, email);
  } catch {
    // Storage unavailable (private mode) — the listener just types their email again next time.
  }
}

/**
 * A gated "Continue with Spotify" control. Allowed callers (open access, seated testers,
 * session-checked accounts) go straight to `signIn("spotify")` with the surface's original
 * callback; everyone else gets the outcome inline — the one-field email step for anonymous
 * visitors, honest pending copy, or the tester request form pre-filled — without leaving the page.
 */
export function SpotifyGateButton({
  callbackUrl,
  source,
  className = "primary-action",
  children,
}: {
  callbackUrl: string;
  source: string;
  className?: string;
  children: ReactNode;
}) {
  type Phase =
    | { kind: "idle" }
    | { kind: "checking" }
    | { kind: "email"; error?: string }
    | { kind: "pending" }
    | { kind: "request"; email: string; declined: boolean }
    | { kind: "unavailable" };
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [email, setEmail] = useState("");

  async function begin(statedEmail?: string) {
    setPhase({ kind: "checking" });
    const config = await fetchGateConfig();
    if (!config.spotifyEnabled) {
      setPhase({ kind: "unavailable" });
      return;
    }
    if (config.openAccess) {
      void signIn("spotify", { callbackUrl });
      return;
    }
    const result = await checkGate(statedEmail || getRememberedEmail() || undefined);
    switch (result.outcome) {
      case "allowed":
        rememberEmail(result.email);
        void signIn("spotify", { callbackUrl });
        return; // stay in "checking" — the browser is redirecting
      case "email_required":
        setPhase({ kind: "email", error: result.error });
        return;
      case "pending":
        setPhase({ kind: "pending" });
        return;
      case "declined":
      case "not_found":
        setEmail(result.email ?? statedEmail ?? "");
        setPhase({ kind: "request", email: result.email ?? "", declined: result.outcome === "declined" });
        return;
    }
  }

  return (
    <div className="spotify-gate">
      <button
        className={className}
        disabled={phase.kind === "checking"}
        onClick={() => void begin()}
        type="button"
      >
        {phase.kind === "checking" ? "Checking your seat…" : children}
      </button>

      {phase.kind === "email" ? (
        <div className="spotify-gate-step">
          <p className="listener-onboarding-copy">
            Spotify is invite-only while we&apos;re in their beta — enter your email to check your
            seat or apply. We only use it for this check (it pre-fills the request if you&apos;re
            not on the list yet).
          </p>
          <div className="listener-email-row">
            <input
              aria-label="Email to check against the Spotify beta list"
              autoComplete="email"
              inputMode="email"
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (email.trim()) void begin(email.trim());
                }
              }}
              placeholder="you@example.com"
              type="email"
              value={email}
            />
            <button
              className="primary-action"
              disabled={!email.trim()}
              onClick={() => void begin(email.trim())}
              type="button"
            >
              Check my seat
            </button>
          </div>
          {phase.error ? <p className="form-message error">{phase.error}</p> : null}
        </div>
      ) : null}

      {phase.kind === "pending" ? (
        <p className="form-message notice">
          Your request is in — we&apos;ll email you the moment your seat is ready. Until then,
          email sign-in gives you the same account Spotify will land on.
        </p>
      ) : null}

      {phase.kind === "request" ? (
        <div className="spotify-gate-step">
          <p className="form-message notice">
            {phase.declined
              ? "We couldn't seat that email last time — seats are limited to 25 while we're in Spotify's beta. You can re-apply below, and everything else works with email sign-in."
              : "That email isn't on the beta list yet. Apply below — we'll email you the moment your seat is ready."}
          </p>
          <TesterRequestForm defaultEmail={phase.email || email} source={source} />
        </div>
      ) : null}

      {phase.kind === "unavailable" ? (
        <p className="form-message notice">Spotify sign-in is not configured yet.</p>
      ) : null}
    </div>
  );
}

type EmailDoorState = { kind: "idle" | "notice" | "success" | "error"; message: string };

/**
 * The chooser panel: Continue with Spotify (gated), sign in with email (always present, never
 * demoted), and Request Spotify access (only while the gate is up). One component, two shells —
 * the in-page modal and the full-page custom `pages.signIn`.
 */
export function SignInChooser({
  callbackUrl,
  source,
  heading = "Sign in to keep your taste",
  description = "Spotify is optional — everything else works with email. Either way it's one account: your saves, follows, and tuning stay put.",
}: {
  callbackUrl: string;
  source: string;
  heading?: string;
  description?: string;
}) {
  const [emailDoor, setEmailDoor] = useState(false);
  const [requestDoor, setRequestDoor] = useState(false);
  const [openAccess, setOpenAccess] = useState<boolean | null>(null);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [email, setEmail] = useState("");
  const [emailState, setEmailState] = useState<EmailDoorState>({ kind: "idle", message: "" });

  // Resolve the flags so the "Request access" door hides under open access and the Google door only
  // shows when Google OAuth is configured.
  useEffect(() => {
    let active = true;
    void fetchGateConfig().then((config) => {
      if (active) {
        setOpenAccess(config.openAccess);
        setGoogleEnabled(config.googleEnabled);
      }
    });
    return () => {
      active = false;
    };
  }, []);

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
          "Check your inbox for a one-tap sign-in link — it may take a minute, and check spam if you don't see it.",
      });
    } catch {
      setEmailState({ kind: "error", message: "Could not send the link. Try again in a moment." });
    }
  }

  return (
    <div className="signin-chooser">
      <p className="eyebrow">Sign in</p>
      <h2>{heading}</h2>
      <p className="signin-chooser-copy">{description}</p>

      <div className="signin-chooser-doors">
        <SpotifyGateButton callbackUrl={callbackUrl} source={source} className="primary-action">
          Continue with Spotify
        </SpotifyGateButton>

        {googleEnabled ? (
          <button
            className="ghost-control"
            onClick={() => void signIn("google", { callbackUrl })}
            type="button"
          >
            Continue with Google
          </button>
        ) : null}

        {!emailDoor ? (
          <button className="ghost-control" onClick={() => setEmailDoor(true)} type="button">
            Sign in with email
          </button>
        ) : (
          <div className="spotify-gate-step">
            <label htmlFor={`chooser-email-${source}`}>Sign in with email</label>
            <div className="listener-email-row">
              <input
                autoComplete="email"
                id={`chooser-email-${source}`}
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
        )}

        {openAccess === false ? (
          !requestDoor ? (
            <button className="ghost-control" onClick={() => setRequestDoor(true)} type="button">
              Request Spotify access
            </button>
          ) : (
            <div className="spotify-gate-step">
              <p className="listener-onboarding-copy">
                Spotify import is invite-only while we&apos;re in Spotify&apos;s beta program.
                Apply and we&apos;ll email you the moment your seat is ready.
              </p>
              <TesterRequestForm source={source} />
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}

/** The in-page modal shell around the chooser, for action-triggered sign-in nudges. */
export function SignInChooserModal({
  callbackUrl,
  source,
  onClose,
  heading,
  description,
}: {
  callbackUrl: string;
  source: string;
  onClose: () => void;
  heading?: string;
  description?: string;
}) {
  return (
    <div
      className="listener-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        aria-label="Sign in"
        aria-modal="true"
        className="signin-chooser-modal"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
          }
        }}
        role="dialog"
      >
        <button
          aria-label="Close sign-in"
          className="listener-icon-button signin-chooser-close"
          onClick={onClose}
          type="button"
        >
          <X aria-hidden="true" size={18} strokeWidth={2.6} />
        </button>
        <SignInChooser
          callbackUrl={callbackUrl}
          source={source}
          heading={heading}
          description={description}
        />
      </section>
    </div>
  );
}

/**
 * Modal-state helper for call sites: `const { chooser, openChooser } = useSignInChooser();` —
 * render `{chooser}` once in the component's tree and call `openChooser({ callbackUrl, source })`
 * where `signIn("spotify")` used to fire.
 */
export function useSignInChooser() {
  const [params, setParams] = useState<{
    callbackUrl: string;
    source: string;
    heading?: string;
    description?: string;
  } | null>(null);

  const chooser = params ? (
    <SignInChooserModal
      callbackUrl={params.callbackUrl}
      source={params.source}
      heading={params.heading}
      description={params.description}
      onClose={() => setParams(null)}
    />
  ) : null;

  return { chooser, openChooser: setParams };
}
