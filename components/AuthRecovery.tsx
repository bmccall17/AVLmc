"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { SpotifyGateButton } from "@/components/SignInChooser";
import type { AuthFailure, AuthFailureAction } from "@/lib/auth-failures";

/**
 * Auth & linking failure recovery surface (PRD 37 / Phase 15). Renders a taxonomy entry — accurate
 * title/message + exactly one primary recoverable action (plus an optional fallback) — replacing the
 * blind `/auth/error` redirect. Copy comes entirely from `lib/auth-failures.ts`, so the error page,
 * the beta surface, and the profile UI can never drift.
 */
export function AuthRecovery({ failure }: { failure: AuthFailure }) {
  return (
    <section className={`auth-recovery auth-recovery-${failure.severity}`}>
      <p className="eyebrow">
        {failure.severity === "limitation"
          ? "Heads up"
          : failure.severity === "conflict"
            ? "Account conflict"
            : "Sign-in interrupted"}
      </p>
      <h1>{failure.title}</h1>
      <p className="auth-recovery-message">{failure.message}</p>
      <div className="auth-recovery-actions">
        <RecoveryAction action={failure.action} primary />
        {failure.secondaryAction ? (
          <RecoveryAction action={failure.secondaryAction} primary={false} />
        ) : null}
      </div>
    </section>
  );
}

function RecoveryAction({ action, primary }: { action: AuthFailureAction; primary: boolean }) {
  const className = primary ? "primary-action" : "ghost-control";

  // Client-driven actions: re-run a provider sign-in (through the PRD 43 gate — a retry from a
  // non-allowlisted account must land on the request form, not back on Spotify's 403), or clear
  // the (stale) session.
  if (action.kind === "retry_spotify") {
    return (
      <SpotifyGateButton callbackUrl="/" className={className} source="auth-recovery">
        {action.label}
      </SpotifyGateButton>
    );
  }
  if (action.kind === "clear_session") {
    return (
      <button
        className={className}
        onClick={() => void signOut({ callbackUrl: "/" })}
        type="button"
      >
        {action.label}
      </button>
    );
  }

  // Navigation actions (request access / use email / sign-in-then-link / open browser / go home).
  return (
    <Link className={className} href={action.href ?? "/"}>
      {action.label}
    </Link>
  );
}
