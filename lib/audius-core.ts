// Pure provider core for Audius previews — no network, DOM, or timers, so it stays unit-testable in
// isolation (tests/audius-core.test.ts). The network layer (lib/audius.ts) resolves a discovery host
// and fetches search results; this module owns the *decisions*: how a search result is scored against
// the event's artist name, which track is picked, and every URL guard that stands between a raw API
// value and a sink (an `<audio>` src or an anchor href).
//
// Audius is being evaluated as a candidate music-preview provider for discovery event cards. Unlike
// Spotify's dead 30-second `preview_url`, an Audius track exposes a full streamable MP3 via its
// discovery nodes, so it can actually drive the board's hover-listening behavior. The open question
// the Card FX Lab answers is *match quality*: does searching Audius for an event's artist name find the
// right artist often enough to be worth wiring into the live event page? That judgement rests on the
// confidence this module reports, so the scoring here is deliberately conservative — a wrong artist is
// worse than no preview (same rule as PRD 46's artist-embed matching, lib/artist-match-core.ts).

import { normalizeArtistName } from "./artist-match-core";

/**
 * How strongly the picked track's artist name matches the event's artist name:
 *   - `exact`  — names fold to the same normalized key (case/diacritics/punctuation-insensitive).
 *   - `strong` — every query word appears in the candidate artist, or ≥60% token overlap.
 *   - `weak`   — some word overlap, but not enough to trust for a live card.
 *   - `none`   — no word overlap at all (never returned as a pick; surfaces as the fallback state).
 */
export type AudiusMatchConfidence = "exact" | "strong" | "weak" | "none";

/** A single track candidate distilled from an Audius `/v1/tracks/search` hit. */
export type AudiusTrackCandidate = {
  id: string;
  title: string;
  artistName: string;
  artistHandle: string | null;
  /** Site-relative permalink like `/handle/track-slug` (used to build the source link). */
  permalink: string | null;
  playCount: number;
  favoriteCount: number;
  isStreamable: boolean;
  durationSec: number | null;
  artworkUrl: string | null;
};

/** The chosen track plus how confident we are that its artist is the event's artist. */
export type AudiusMatch = {
  track: AudiusTrackCandidate;
  confidence: AudiusMatchConfidence;
  /** 0..1 name-match strength (1 = exact normalized-name match). */
  score: number;
};

/**
 * The provider's answer for one artist-name lookup. Shared by the server route and the client hook,
 * so it lives in the pure core (no network import leaks into the browser bundle). Exactly one of the
 * three shapes is returned:
 *   - `ok`       — a track was matched and a playable stream URL resolved.
 *   - `no_match` — the search ran but nothing shared any words with the artist name (fallback state).
 *   - `error`    — the search itself failed (host/network/parse). Message is safe to surface.
 */
export type AudiusPreviewResult =
  | {
      status: "ok";
      query: string;
      match: AudiusMatch;
      /** Fully-qualified discovery-node stream URL, guarded by isSafeAudiusStreamUrl. */
      streamUrl: string;
      /** Public audius.co page for the track (attribution / "open on Audius"), or null. */
      sourceUrl: string | null;
      /** Which discovery host served the result — handy when judging reliability in the lab. */
      host: string;
      /** How many candidates the search returned before picking. */
      candidatesConsidered: number;
    }
  | { status: "no_match"; query: string; candidatesConsidered: number }
  | { status: "error"; query: string; message: string };

/** Only picks at or above this confidence should be treated as safe to auto-play on a live card. */
export const AUDIUS_CONFIDENT: readonly AudiusMatchConfidence[] = ["exact", "strong"];

/** Whether a match is trustworthy enough to drive a production event-card preview. */
export function isConfidentAudiusMatch(match: AudiusMatch | null | undefined): boolean {
  return match != null && AUDIUS_CONFIDENT.includes(match.confidence);
}

const CONFIDENCE_LABEL: Record<AudiusMatchConfidence, string> = {
  exact: "Exact name match",
  strong: "Strong match",
  weak: "Weak — review before trusting",
  none: "No match",
};

export function audiusConfidenceLabel(confidence: AudiusMatchConfidence): string {
  return CONFIDENCE_LABEL[confidence];
}

/**
 * Score one candidate artist name against the event's artist name. Reuses the same normalization as
 * the Spotify artist matcher (fold case, diacritics, `&`→`and`, punctuation→space) so both providers
 * judge names identically. Returns a 0..1 word-overlap score and a bucketed confidence.
 */
export function scoreArtistNameMatch(
  query: string,
  candidateArtist: string
): { confidence: AudiusMatchConfidence; score: number } {
  const qn = normalizeArtistName(query);
  const cn = normalizeArtistName(candidateArtist);
  if (qn.length === 0 || cn.length === 0) {
    return { confidence: "none", score: 0 };
  }
  if (qn === cn) {
    return { confidence: "exact", score: 1 };
  }

  const qt = qn.split(" ");
  const ct = new Set(cn.split(" "));
  const shared = qt.filter((token) => ct.has(token)).length;
  if (shared === 0) {
    return { confidence: "none", score: 0 };
  }

  // Overlap relative to the longer name so a short query hiding inside a long title doesn't score
  // artificially high (e.g. "Live" ⊂ "Live at the Grey Eagle" should not read as a strong artist match).
  const score = shared / Math.max(qt.length, ct.size);
  const allQueryWordsPresent = shared === qt.length;
  const confidence: AudiusMatchConfidence =
    allQueryWordsPresent || score >= 0.6 ? "strong" : "weak";
  return { confidence, score };
}

const CONFIDENCE_RANK: Record<AudiusMatchConfidence, number> = {
  exact: 3,
  strong: 2,
  weak: 1,
  none: 0,
};

/**
 * Pick the best streamable track for an artist-name query. Streamable tracks only (a non-streamable
 * hit can't drive a preview). Ranks by name-match confidence first, then raw overlap score, then
 * Audius popularity (plays, then favorites) as the tiebreak between equally-named candidates. Returns
 * null when nothing shares a single word with the artist name — the caller surfaces that as the
 * "no confident match" fallback rather than auto-playing a wrong artist.
 */
export function pickBestAudiusTrack(
  query: string,
  candidates: AudiusTrackCandidate[]
): AudiusMatch | null {
  let best: AudiusMatch | null = null;
  for (const track of candidates) {
    if (!track.isStreamable) {
      continue;
    }
    const { confidence, score } = scoreArtistNameMatch(query, track.artistName);
    if (confidence === "none") {
      continue;
    }
    if (best === null || isBetter({ track, confidence, score }, best)) {
      best = { track, confidence, score };
    }
  }
  return best;
}

function isBetter(a: AudiusMatch, b: AudiusMatch): boolean {
  if (CONFIDENCE_RANK[a.confidence] !== CONFIDENCE_RANK[b.confidence]) {
    return CONFIDENCE_RANK[a.confidence] > CONFIDENCE_RANK[b.confidence];
  }
  if (a.score !== b.score) {
    return a.score > b.score;
  }
  if (a.track.playCount !== b.track.playCount) {
    return a.track.playCount > b.track.playCount;
  }
  return a.track.favoriteCount > b.track.favoriteCount;
}

// Audius track ids are short base-62-ish hashids (e.g. "7eP5n", "D7KyD"). Validate the shape before
// the id is spliced into a stream URL so no tainted value reaches the `<audio>` sink.
const AUDIUS_ID_RE = /^[A-Za-z0-9]{1,32}$/;

export function isSafeAudiusTrackId(id: string): boolean {
  return AUDIUS_ID_RE.test(id);
}

/** Discovery-node path that streams a track's audio (Audius follows it to a CDN MP3 with a 302). */
export function audiusStreamPath(trackId: string): string {
  return `/v1/tracks/${encodeURIComponent(trackId)}/stream`;
}

/**
 * Sink guard for a stream URL before it is assigned to `<audio>.src` (mirrors isSafePreviewUrl in
 * lib/hover-player-core.ts, but for Audius). The discovery *host* is server-resolved from api.audius.co
 * and can be any of dozens of third-party nodes, so we can't allowlist it; instead we pin the shape:
 * https, and a path of exactly `/v1/tracks/<safe-id>/stream`. Query params (app_name) are allowed.
 */
export function isSafeAudiusStreamUrl(url: string | null | undefined): url is string {
  if (typeof url !== "string" || url.length === 0) {
    return false;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      return false;
    }
    const match = parsed.pathname.match(/^\/v1\/tracks\/([^/]+)\/stream$/);
    return match != null && isSafeAudiusTrackId(decodeURIComponent(match[1]));
  } catch {
    return false;
  }
}

/**
 * Build the public audius.co page URL from a candidate's site-relative permalink, resolved through the
 * URL parser so a tampered permalink (`//evil.com`, `https://…`, a path escape) can never point the
 * "open on Audius" link off-origin. Returns null if the permalink doesn't resolve to audius.co.
 */
export function audiusPermalinkUrl(permalink: string | null | undefined): string | null {
  if (typeof permalink !== "string" || !permalink.startsWith("/") || permalink.startsWith("//")) {
    return null;
  }
  try {
    const url = new URL(permalink, "https://audius.co");
    return url.origin === "https://audius.co" ? url.toString() : null;
  } catch {
    return null;
  }
}
