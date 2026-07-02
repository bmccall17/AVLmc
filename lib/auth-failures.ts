import { SPOTIFY_LIMITED_BETA_MESSAGE } from "./spotify-limited-access";

/**
 * Auth & linking failure taxonomy — pure mapping (PRD 37 / Phase 15). No DB/network/React imports,
 * so the "what happened + what to do" copy is the single source of truth, unit-tested in isolation
 * (tests/auth-failures.test.ts) and reused by the `app/auth/error` recovery page and the profile UI.
 * Every failure maps to {title, message, one primary recoverable action} — never a generic dead-end.
 *
 * Posture (locked, see the epic): a *limitation* (beta cap → requestable) reads differently from an
 * *error* (cancelled / expired → retryable) and from a *conflict* (duplicate email → resolvable by
 * authenticated linking). The duplicate path NEVER offers "merge anyway" — only sign-in-then-link.
 */

export type AuthFailureCode =
  | "spotify_limited_beta"
  | "access_denied"
  | "duplicate_account"
  | "redirect_loop"
  | "stale_session"
  | "browser_fallback"
  | "unknown";

/** How a recovery action behaves. Links carry `href`; the rest are handled client-side by kind. */
export type AuthFailureActionKind =
  | "request_spotify_access"
  | "use_email"
  | "retry_spotify"
  | "sign_in_then_link"
  | "clear_session"
  | "open_default_browser"
  | "go_home";

export type AuthFailureAction = {
  kind: AuthFailureActionKind;
  label: string;
  /** Present for plain navigation actions; client-driven actions (retry/clear) omit it. */
  href?: string;
};

/** A limitation vs. error vs. conflict — drives tone, not just copy. */
export type AuthFailureSeverity = "limitation" | "error" | "conflict";

export type AuthFailure = {
  code: AuthFailureCode;
  severity: AuthFailureSeverity;
  title: string;
  message: string;
  /** Exactly one primary recoverable next step. */
  action: AuthFailureAction;
  /** An optional fallback (e.g. "or use email"). */
  secondaryAction?: AuthFailureAction;
};

const GO_HOME: AuthFailureAction = { kind: "go_home", label: "Back to your board", href: "/" };
const USE_EMAIL: AuthFailureAction = {
  kind: "use_email",
  label: "Sign in with email instead",
  href: "/",
};

/** The one table. Every entry has accurate copy + exactly one primary action. No drift allowed. */
export const AUTH_FAILURES: Record<AuthFailureCode, AuthFailure> = {
  spotify_limited_beta: {
    code: "spotify_limited_beta",
    severity: "limitation",
    title: "Spotify import is invite-only right now",
    message: SPOTIFY_LIMITED_BETA_MESSAGE,
    action: {
      kind: "request_spotify_access",
      label: "Request Spotify access",
      // The public tester-request capture page (PRD 42) — previously a dead link to the homepage.
      href: "/spotify-access",
    },
    secondaryAction: USE_EMAIL,
  },
  access_denied: {
    code: "access_denied",
    severity: "error",
    title: "Spotify connection was cancelled",
    message:
      "The Spotify sign-in was cancelled or the permissions weren't granted, so nothing was connected. You can try again, or just sign in with your email — Spotify is optional.",
    action: { kind: "retry_spotify", label: "Try connecting Spotify again" },
    secondaryAction: USE_EMAIL,
  },
  duplicate_account: {
    code: "duplicate_account",
    severity: "conflict",
    title: "That email already belongs to an account",
    message:
      "The email from this sign-in method is already on a different AVL Music Companion account. We never merge accounts behind your back — sign into that account first, then connect this method from your profile so everything stays on one account.",
    action: {
      kind: "sign_in_then_link",
      label: "Sign into that account, then connect",
      href: "/",
    },
  },
  redirect_loop: {
    code: "redirect_loop",
    severity: "error",
    title: "Sign-in didn't complete",
    message:
      "The sign-in bounced back without finishing — usually a stale cookie from a previous attempt. Sign out to clear it, then try again from your board.",
    action: { kind: "clear_session", label: "Sign out and start fresh" },
    secondaryAction: GO_HOME,
  },
  stale_session: {
    code: "stale_session",
    severity: "error",
    title: "Your session expired",
    message:
      "Your previous session is no longer valid. Sign out to clear it and sign back in — your saved shows, follows, and preferences are safe and tied to your account.",
    action: { kind: "clear_session", label: "Sign out and sign back in" },
    secondaryAction: GO_HOME,
  },
  browser_fallback: {
    code: "browser_fallback",
    severity: "error",
    title: "This browser blocked sign-in",
    message:
      "Sign-in needs cookies, which this view (often an in-app/embedded browser, or a private window with third-party cookies blocked) is blocking. Open avlmc in your default browser — Safari, Chrome, or Firefox — and try again.",
    action: { kind: "open_default_browser", label: "Back to your board", href: "/" },
  },
  unknown: {
    code: "unknown",
    severity: "error",
    title: "Sign-in didn't complete",
    message:
      "Something interrupted sign-in before it finished. Try again, or sign in with your email — your board keeps working either way.",
    action: { kind: "retry_spotify", label: "Try again" },
    secondaryAction: USE_EMAIL,
  },
};

/**
 * Map a raw error identifier — an Auth.js `?error=` param OR one of our own AuthFailureCodes — to a
 * taxonomy entry. Case-insensitive; unknown/missing input degrades to the honest `unknown` entry
 * (retry + email), never a blank dead-end.
 */
export function resolveAuthFailure(raw: string | null | undefined): AuthFailure {
  const key = (raw ?? "").trim().toLowerCase();

  switch (key) {
    // Our own codes (the error page / profile can request a specific entry directly).
    case "spotify_limited_beta":
    case "spotify_limited_beta_access":
      return AUTH_FAILURES.spotify_limited_beta;
    case "access_denied":
      return AUTH_FAILURES.access_denied;
    case "duplicate_account":
      return AUTH_FAILURES.duplicate_account;
    case "redirect_loop":
      return AUTH_FAILURES.redirect_loop;
    case "stale_session":
      return AUTH_FAILURES.stale_session;
    case "browser_fallback":
      return AUTH_FAILURES.browser_fallback;

    // Auth.js error params.
    case "accessdenied":
      return AUTH_FAILURES.access_denied;
    case "oauthaccountnotlinked":
      return AUTH_FAILURES.duplicate_account;
    case "sessionrequired":
      return AUTH_FAILURES.stale_session;
    // A failed Spotify OAuth callback in this app is overwhelmingly the dev-mode (invite-only) block;
    // surface the recoverable beta path rather than a generic error.
    case "oauthcallbackerror":
    case "oauthcallback":
    case "oauthsignin":
    case "callback":
      return AUTH_FAILURES.spotify_limited_beta;

    default:
      return AUTH_FAILURES.unknown;
  }
}
