/**
 * Spotify tester-slot access requests — pure logic (PRD 36 / Phase 15). No DB/network imports, so
 * email validation and the status lifecycle are unit-tested in isolation
 * (tests/spotify-access-requests.test.ts) and reused by the service + routes. It only validates and
 * classifies; it never reads/writes the request or decides admin authorization.
 *
 * Lifecycle: a listener submits `pending` → the admin adds them in the Spotify Developer Dashboard
 * and marks `slot_added` → the listener's retry succeeds and the admin marks `approved` (or the
 * request is `rejected`). `pending`/`slot_added` are the OPEN states (one open request per user);
 * `approved`/`rejected` are terminal/closed.
 */

export type SpotifyAccessRequestStatus = "pending" | "slot_added" | "approved" | "rejected";

/** Open = still being worked: the listener has an outstanding ask. At most one open row per user. */
export const OPEN_SPOTIFY_ACCESS_STATUSES: readonly SpotifyAccessRequestStatus[] = [
  "pending",
  "slot_added",
];

/** Statuses an admin may set from the review queue. A listener can only ever create `pending`. */
export const ADMIN_SETTABLE_SPOTIFY_ACCESS_STATUSES: readonly SpotifyAccessRequestStatus[] = [
  "slot_added",
  "approved",
  "rejected",
];

/** Terminal statuses stamp `resolved_at` (the request is closed, not in the open queue anymore). */
export const TERMINAL_SPOTIFY_ACCESS_STATUSES: readonly SpotifyAccessRequestStatus[] = [
  "approved",
  "rejected",
];

export function isOpenSpotifyAccessStatus(status: string): status is SpotifyAccessRequestStatus {
  return (OPEN_SPOTIFY_ACCESS_STATUSES as readonly string[]).includes(status);
}

export function isAdminSettableSpotifyAccessStatus(
  status: string
): status is SpotifyAccessRequestStatus {
  return (ADMIN_SETTABLE_SPOTIFY_ACCESS_STATUSES as readonly string[]).includes(status);
}

export function isTerminalSpotifyAccessStatus(
  status: string
): status is SpotifyAccessRequestStatus {
  return (TERMINAL_SPOTIFY_ACCESS_STATUSES as readonly string[]).includes(status);
}

/** Raised when a submitted Spotify email is missing/malformed. Mapped to a 400 by the route. */
export class SpotifyAccessRequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpotifyAccessRequestValidationError";
  }
}

/** Trim + lowercase, matching how the email is stored/compared (mirrors normalizeEmail). */
export function normalizeSpotifyEmail(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

/** Conservative single-address shape check — enough to reject obvious junk before it hits the DB. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Validate + normalize a listener-submitted Spotify email. Throws
 * SpotifyAccessRequestValidationError on anything unusable so the caller never stores junk.
 */
export function validateSpotifyEmail(raw: string | null | undefined): string {
  const email = normalizeSpotifyEmail(raw);
  if (!email) {
    throw new SpotifyAccessRequestValidationError("Enter the email on your Spotify account.");
  }
  if (email.length > 320 || !looksLikeEmail(email)) {
    throw new SpotifyAccessRequestValidationError("That doesn't look like a valid email address.");
  }
  return email;
}
