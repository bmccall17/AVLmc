"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type FormState = { kind: "idle" | "notice" | "success" | "error"; message: string };

/**
 * Feedback form for the 404 detour. A listener can tell us what they were looking for; on send we
 * thank them and return them to the board. Anonymous-friendly (POSTs to the public /api/feedback);
 * an optional email lets us follow up. "Skip" just goes home. Resilient — a server hiccup shows a
 * gentle retry, never a dead-end.
 */
export function FeedbackForm() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [state, setState] = useState<FormState>({ kind: "idle", message: "" });

  async function submit() {
    const trimmed = message.trim();
    if (!trimmed) {
      return;
    }
    setState({ kind: "notice", message: "Sending…" });
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          email: email.trim() || undefined,
          path: typeof window !== "undefined" ? window.location.pathname : undefined,
          website,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not send your note.");
      }
      setState({ kind: "success", message: "Thanks — taking you back to the board." });
      setTimeout(() => router.push("/"), 1000);
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not send your note.",
      });
    }
  }

  return (
    <section className="not-found-feedback">
      <h2>Tell us what you were looking for</h2>
      <p>What link sent you here, or what did you hope to find? It helps us fix the connection.</p>
      <textarea
        aria-label="Your feedback"
        maxLength={2000}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="I clicked a link to… / I was trying to find…"
        rows={3}
        value={message}
      />
      <input
        aria-label="Your email (optional)"
        autoComplete="email"
        inputMode="email"
        onChange={(event) => setEmail(event.target.value)}
        placeholder="Email (optional — only if you'd like a reply)"
        type="email"
        value={email}
      />
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
      <div className="not-found-feedback-actions">
        <button
          className="primary-action"
          disabled={!message.trim() || state.kind === "notice" || state.kind === "success"}
          onClick={() => void submit()}
          type="button"
        >
          Send feedback
        </button>
        <Link className="ghost-control" href="/">
          Skip &amp; go home
        </Link>
      </div>
      {state.message ? <p className={`form-message ${state.kind}`}>{state.message}</p> : null}
    </section>
  );
}
