"use client";

import { useState } from "react";

type SubmitState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "done"; message: string }
  | { kind: "error"; message: string };

/**
 * Anonymous Spotify tester request form (PRD 42 / Phase 17). Email + an optional
 * "what do you listen to?" note, posted to the public capture API. Includes the same hidden
 * `website` honeypot the community form uses. `source` records which surface spawned the request
 * (`spotify-access-page`, later `signin-chooser`). Signed-in visitors get their email pre-filled.
 */
export function TesterRequestForm({
  defaultEmail,
  source,
}: {
  defaultEmail?: string | null;
  source: string;
}) {
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [note, setNote] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<SubmitState>({ kind: "idle" });

  async function submit() {
    if (!email.trim() || state.kind === "sending") {
      return;
    }
    setState({ kind: "sending" });
    try {
      const response = await fetch("/api/tester-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, note, source, website }),
      });
      const data = (await response.json()) as {
        error?: string;
        status?: "pending" | "approved" | "declined" | "invited";
        alreadyRequested?: boolean;
      };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not send your request.");
      }
      setState({ kind: "done", message: confirmationFor(data.status, data.alreadyRequested) });
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not send your request.",
      });
    }
  }

  if (state.kind === "done") {
    return <p className="form-message success">{state.message}</p>;
  }

  return (
    <form
      className="tester-request-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label className="form-field">
        <span>Email on your Spotify account</span>
        <input
          autoComplete="email"
          inputMode="email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
          type="email"
          value={email}
        />
      </label>
      <label className="form-field">
        <span>What do you listen to? (optional)</span>
        <textarea
          maxLength={1000}
          name="note"
          onChange={(event) => setNote(event.target.value)}
          placeholder="Artists, genres, the last show you loved…"
          rows={3}
          value={note}
        />
      </label>
      {/* Honeypot — humans never see or fill this (same anti-spam pattern as the community form). */}
      <input
        aria-hidden="true"
        autoComplete="off"
        name="website"
        onChange={(event) => setWebsite(event.target.value)}
        style={{ position: "absolute", left: "-9999px", height: 0, width: 0, opacity: 0 }}
        tabIndex={-1}
        type="text"
        value={website}
      />
      <button className="primary-action" disabled={!email.trim() || state.kind === "sending"} type="submit">
        {state.kind === "sending" ? "Sending…" : "Request Spotify access"}
      </button>
      {state.kind === "error" ? <p className="form-message error">{state.message}</p> : null}
    </form>
  );
}

function confirmationFor(
  status: "pending" | "approved" | "declined" | "invited" | undefined,
  alreadyRequested: boolean | undefined
): string {
  if (status === "approved" || status === "invited") {
    return "Good news — your seat is already approved. Head back and sign in with Spotify; check your inbox for the invite.";
  }
  if (status === "declined") {
    return "Your request is on file. Seats are limited right now — we'll email you if one opens up.";
  }
  return alreadyRequested
    ? "You're already on the list — we'll email you the moment your seat is ready."
    : "Request received. We'll email you the moment your seat is ready.";
}
