/**
 * Anonymous Spotify tester requests — pure logic (PRD 42 / Phase 17). No DB/network imports, so the
 * email/note/source validation, status lifecycle, upsert semantics, notification decision, and the
 * request-form rate window are unit-tested in isolation (tests/tester-requests.test.ts) and reused
 * by the data service + routes. It only validates and classifies; it never touches the store.
 *
 * Lifecycle: an applicant lands `pending` → the owner allowlists the email in the Spotify Developer
 * Dashboard and approves it here (`approved`), which sends the invite email (`invited` once sent).
 * `declined` emails can re-apply without re-notifying the owner; the owner can re-open to `pending`.
 * Re-applying NEVER duplicates a row and NEVER demotes a status.
 */

export type TesterRequestStatus = "pending" | "approved" | "declined" | "invited";

/**
 * Spotify Development Mode's hard allowlist budget (User Management, Spotify Developer Dashboard).
 * As of Spotify's February 2026 Development Mode changes this is the app owner (who must have Spotify
 * Premium) plus up to 5 authenticated users — the dashboard shows "maximum of 5 users". The old
 * 25-user cap is gone; seat-free CSV taste import is the path for everyone beyond the 5 (PRD 45).
 */
export const TESTER_SEAT_BUDGET = 5;

/** Show a "seats are nearly full" warning in the admin panel from this many seated testers. */
export const TESTER_SEAT_WARNING_AT = 4;

/** Statuses that hold (or held) a Development Mode seat — counted against the seat budget. */
export const SEATED_TESTER_STATUSES: readonly TesterRequestStatus[] = ["approved", "invited"];

export function isSeatedTesterStatus(status: string): status is TesterRequestStatus {
  return (SEATED_TESTER_STATUSES as readonly string[]).includes(status);
}

export function isTesterRequestStatus(status: string): status is TesterRequestStatus {
  return status === "pending" || status === "approved" || status === "declined" || status === "invited";
}

/** Raised when a submitted email/note is unusable. Mapped to a 400 by the route. */
export class TesterRequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TesterRequestValidationError";
  }
}

/** Trim + lowercase, matching how the email is stored/compared (mirrors normalizeSpotifyEmail). */
export function normalizeTesterEmail(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

/** Conservative single-address shape check — enough to reject obvious junk before it hits the DB. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Validate + normalize an applicant-submitted email. Throws TesterRequestValidationError on
 * anything unusable so the caller never stores junk.
 */
export function validateTesterEmail(raw: string | null | undefined): string {
  const email = normalizeTesterEmail(raw);
  if (!email) {
    throw new TesterRequestValidationError("Enter the email on your Spotify account.");
  }
  if (email.length > 320 || !looksLikeEmail(email)) {
    throw new TesterRequestValidationError("That doesn't look like a valid email address.");
  }
  return email;
}

const NOTE_MAX_LENGTH = 1000;

/** Trim + cap the optional "what do you listen to?" note; empty becomes null (not stored as ""). */
export function validateTesterNote(raw: string | null | undefined): string | null {
  const note = (raw ?? "").trim();
  if (!note) {
    return null;
  }
  if (note.length > NOTE_MAX_LENGTH) {
    throw new TesterRequestValidationError("Keep the note under 1,000 characters.");
  }
  return note;
}

const SOURCE_MAX_LENGTH = 64;

/**
 * Normalize the surface that spawned the request (e.g. `auth-error-page`, `spotify-access-page`,
 * `signin-chooser`) to a safe slug; anything unusable degrades to `direct`.
 */
export function normalizeTesterSource(raw: string | null | undefined): string {
  const slug = (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SOURCE_MAX_LENGTH);
  return slug || "direct";
}

/**
 * Upsert semantics: what status a re-apply keeps. A new applicant is `pending`; an existing row
 * keeps its status — re-applying never demotes `approved`/`invited` (their seat stands) and never
 * flips `declined` back to `pending` by itself (only the owner re-opens).
 */
export function resolveUpsertStatus(existing: TesterRequestStatus | null): TesterRequestStatus {
  return existing ?? "pending";
}

/**
 * The owner is notified once per genuine new interest: only a brand-new row notifies. Re-applies
 * (including declined re-applies) refresh `updated_at` silently — no notification fatigue.
 */
export function shouldNotifyOwner(created: boolean): boolean {
  return created;
}

/**
 * Sliding-window rate limiting for the public request form, as pure timestamp-list operations so
 * the route's in-memory limiter is testable. `recordAttempt` returns the pruned window including
 * the new attempt; callers persist it and gate on `isRateLimited` BEFORE recording.
 */
export const RATE_WINDOW_MS = 10 * 60 * 1000;
export const RATE_MAX_PER_IP = 5;
export const RATE_MAX_PER_EMAIL = 3;

export function pruneRateWindow(timestamps: readonly number[], now: number, windowMs = RATE_WINDOW_MS): number[] {
  return timestamps.filter((at) => now - at < windowMs);
}

export function isRateLimited(
  timestamps: readonly number[],
  now: number,
  max: number,
  windowMs = RATE_WINDOW_MS
): boolean {
  return pruneRateWindow(timestamps, now, windowMs).length >= max;
}

export function recordAttempt(
  timestamps: readonly number[],
  now: number,
  windowMs = RATE_WINDOW_MS
): number[] {
  return [...pruneRateWindow(timestamps, now, windowMs), now];
}
