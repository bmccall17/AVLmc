/**
 * Spotify pre-redirect gate — pure logic (PRD 43 / Phase 17). No DB/network imports; the outcome
 * matrix is unit-tested in isolation (tests/spotify-gate.test.ts) and reused by the gate service +
 * route. The gate exists because Spotify Development Mode 403s non-allowlisted users on SPOTIFY'S
 * domain, before any callback — so the check must run BEFORE `signIn("spotify")` redirects.
 *
 * Truth sources (both mirror the same dashboard allowlist, by owner discipline):
 *  - `tester_requests` (PRD 42): the anonymous email-keyed loop — `approved`/`invited` hold a seat.
 *  - `spotify_access_requests` (PRD 36): the signed-in loop — `slot_added`/`approved` hold a seat.
 * `SPOTIFY_OPEN_ACCESS=true` collapses the whole gate: everyone is allowed, no store is read.
 */

import { isSeatedTesterStatus, type TesterRequestStatus } from "./tester-requests-core";
import {
  isOpenSpotifyAccessStatus,
  type SpotifyAccessRequestStatus,
} from "./spotify-access-requests-core";

export type SpotifyGateOutcome =
  /** Proceed to `signIn("spotify")` — the email holds a seat (or open access is on). */
  | "allowed"
  /** A request is on file and being worked — "we'll email you when your seat is ready." */
  | "pending"
  /** The request was declined — honest copy + the re-apply path. */
  | "declined"
  /** No request on file — offer the tester request form, email pre-filled. */
  | "not_found"
  /** Anonymous caller gave no email — the chooser asks for one first. */
  | "email_required";

/** What a `tester_requests` status means at the gate (null = no row). */
export function outcomeFromTesterStatus(
  status: TesterRequestStatus | null
): Exclude<SpotifyGateOutcome, "email_required"> {
  if (!status) return "not_found";
  if (isSeatedTesterStatus(status)) return "allowed";
  return status === "declined" ? "declined" : "pending";
}

/**
 * What a `spotify_access_requests` status means at the gate (null = no row). `slot_added` and
 * `approved` both mean the email is in the dashboard allowlist — the retry should pass. `rejected`
 * maps to declined; `pending` is pending.
 */
export function outcomeFromSpotifyAccessStatus(
  status: SpotifyAccessRequestStatus | null
): Exclude<SpotifyGateOutcome, "email_required"> {
  if (!status) return "not_found";
  if (status === "slot_added" || status === "approved") return "allowed";
  return status === "rejected" ? "declined" : isOpenSpotifyAccessStatus(status) ? "pending" : "declined";
}

/** Most-permissive-wins when both stores have a row (they mirror one allowlist, not two). */
const OUTCOME_PRECEDENCE: readonly SpotifyGateOutcome[] = [
  "allowed",
  "pending",
  "declined",
  "not_found",
];

export function combineGateOutcomes(
  a: Exclude<SpotifyGateOutcome, "email_required">,
  b: Exclude<SpotifyGateOutcome, "email_required">
): Exclude<SpotifyGateOutcome, "email_required"> {
  return (OUTCOME_PRECEDENCE.indexOf(a) <= OUTCOME_PRECEDENCE.indexOf(b) ? a : b) as Exclude<
    SpotifyGateOutcome,
    "email_required"
  >;
}

/**
 * The one gate decision. `openAccess` short-circuits everything (the C4 flag flip); otherwise an
 * identified caller (email and/or account statuses) combines both stores most-permissive-wins,
 * and an unidentified caller must state an email first.
 */
export function resolveGateOutcome(input: {
  openAccess: boolean;
  /** Whether the caller is identified at all (session or stated email). */
  identified: boolean;
  testerStatus: TesterRequestStatus | null;
  accessStatus: SpotifyAccessRequestStatus | null;
}): SpotifyGateOutcome {
  if (input.openAccess) {
    return "allowed";
  }
  if (!input.identified) {
    return "email_required";
  }
  return combineGateOutcomes(
    outcomeFromTesterStatus(input.testerStatus),
    outcomeFromSpotifyAccessStatus(input.accessStatus)
  );
}
