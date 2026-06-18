"use client";

import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";

type MySpotifyAccessRequest = {
  id: string;
  status: "pending" | "slot_added" | "approved" | "rejected";
  spotifyEmail: string;
};

type RequestState = {
  kind: "idle" | "notice" | "success" | "error";
  message: string;
};

/**
 * Spotify tester-slot access request (PRD 36 / Phase 15). Shown when a signed-in listener hits the
 * invite-only Spotify beta wall instead of dead-ending: they submit the email on their Spotify
 * account and see honest "pending" status; once the admin adds them to a tester slot it flips to
 * "added — retry now" with a one-tap reconnect (which, via PRD 35, lands on their existing account).
 */
export function SpotifyAccessRequest({ accountEmail }: { accountEmail: string | null | undefined }) {
  const [request, setRequest] = useState<MySpotifyAccessRequest | null>(null);
  const [email, setEmail] = useState(accountEmail ?? "");
  const [state, setState] = useState<RequestState>({ kind: "idle", message: "" });
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/me/spotify-access-request", { cache: "no-store" });
        if (response.ok && active) {
          const data = (await response.json()) as { request?: MySpotifyAccessRequest | null };
          setRequest(data.request ?? null);
        }
      } finally {
        if (active) setLoaded(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  async function submit() {
    const trimmed = email.trim();
    if (!trimmed) {
      return;
    }
    setState({ kind: "notice", message: "Sending your request…" });
    try {
      const response = await fetch("/api/me/spotify-access-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spotifyEmail: trimmed }),
      });
      const data = (await response.json()) as {
        error?: string;
        request?: MySpotifyAccessRequest;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not submit your request.");
      }
      setRequest(data.request ?? null);
      setState({ kind: "success", message: "" });
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not submit your request.",
      });
    }
  }

  if (!loaded) {
    return null;
  }

  // Admin added them to a tester slot — invite them to retry; PRD 35 lands it on their account.
  if (request?.status === "slot_added") {
    return (
      <div className="listener-spotify-optional">
        <p className="form-message success">
          You&apos;ve been added to a Spotify tester slot. Reconnect to import your taste — it&apos;ll
          link to this same account.
        </p>
        <button
          className="primary-action"
          onClick={() => void signIn("spotify", { callbackUrl: "/" })}
          type="button"
        >
          Connect Spotify (retry)
        </button>
      </div>
    );
  }

  if (request?.status === "pending") {
    return (
      <p className="form-message notice">
        Your Spotify access request is <strong>pending</strong> for{" "}
        <strong>{request.spotifyEmail}</strong>. We&apos;ll add you to an open tester slot — check
        back and reconnect once you&apos;re in. Everything else works without Spotify.
      </p>
    );
  }

  // No open request (none yet, or previously approved/rejected) → offer to ask.
  return (
    <div className="listener-spotify-optional">
      <p className="listener-onboarding-copy">
        Spotify import is invite-only while we&apos;re in Spotify&apos;s beta. Request access with the
        email on your Spotify account and we&apos;ll add you to an open tester slot.
      </p>
      <div className="listener-email-row">
        <input
          aria-label="Your Spotify account email"
          autoComplete="email"
          inputMode="email"
          onChange={(event) => setEmail(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder="you@example.com"
          type="email"
          value={email}
        />
        <button
          className="primary-action"
          disabled={!email.trim() || state.kind === "notice"}
          onClick={() => void submit()}
          type="button"
        >
          Request access
        </button>
      </div>
      {state.message ? <p className={`form-message ${state.kind}`}>{state.message}</p> : null}
    </div>
  );
}
