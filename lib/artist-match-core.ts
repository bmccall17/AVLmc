// Pure, token-agnostic core for artist → Spotify matching (PRD 46, Story C). No DB or network
// imports so it stays unit-testable in isolation (tests/artist-match.test.ts), mirroring
// lib/shared-songs-core.ts / lib/genre-taxonomy.ts. Both the app-token matcher (PRD 46) and the
// PRD 17 user-token path resolve their "best artist" through the same normalization + rules here.

export type ArtistMatchConfidence = "exact" | "fuzzy";

/**
 * Match lifecycle. Only `auto`, `confirmed`, and `replaced` publish an embed; `needs_review`
 * holds a fuzzy/flagged match out of sight until an admin/listener confirms it; `rejected` is a
 * dead match (no artist, or listener-flagged with no replacement).
 */
export type ArtistMatchStatus = "auto" | "needs_review" | "confirmed" | "rejected" | "replaced";

/** Statuses whose embed is safe to render to everyone (the artist "floor"). */
export const PUBLISHED_ARTIST_MATCH_STATUSES: readonly ArtistMatchStatus[] = [
  "auto",
  "confirmed",
  "replaced",
];

export function isPublishedArtistMatchStatus(status: ArtistMatchStatus): boolean {
  return PUBLISHED_ARTIST_MATCH_STATUSES.includes(status);
}

export type SpotifyArtistCandidate = {
  id: string;
  name: string;
  imageUrl?: string | null;
};

export type ArtistMatchDecision = {
  confidence: ArtistMatchConfidence;
  status: ArtistMatchStatus;
  artist: SpotifyArtistCandidate;
};

/**
 * Fold an artist name to a stable comparison key: lowercase, strip diacritics, collapse
 * whitespace, and drop punctuation Spotify tends to vary on (e.g. "Watchhouse" vs "Watch House",
 * "Beyoncé" vs "Beyonce"). Deterministic and pure so the cache key and the equality test agree.
 */
export function normalizeArtistName(name: string): string {
  return name
    .normalize("NFD")
    // Remove combining diacritical marks (U+0300–U+036F): é → e.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // Treat &/and, punctuation, and separators as spaces so folding is about the words.
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** True when two artist names fold to the same normalized key. */
export function artistNamesMatchExactly(a: string, b: string): boolean {
  const left = normalizeArtistName(a);
  return left.length > 0 && left === normalizeArtistName(b);
}

/**
 * Prefer an exact normalized-name match (case/diacritics/whitespace-folded); otherwise fall back
 * to Spotify's top hit. Returns null when there are no candidates at all. Token-agnostic: callers
 * pass whatever candidate list their token could fetch.
 */
export function pickBestArtistMatch(
  candidates: SpotifyArtistCandidate[],
  artistName: string
): SpotifyArtistCandidate | null {
  const exact = candidates.find((candidate) => artistNamesMatchExactly(candidate.name, artistName));
  return exact ?? candidates[0] ?? null;
}

/**
 * PRD 46 safety rule — "a wrong artist is worse than no embed":
 *   - exact normalized name match → confidence `exact`, status `auto` (publishes an embed)
 *   - any other top hit          → confidence `fuzzy`, status `needs_review` (held for review)
 *   - no candidates              → null (caller records no row, or a `rejected` tombstone)
 */
export function decideArtistMatch(
  candidates: SpotifyArtistCandidate[],
  artistName: string
): ArtistMatchDecision | null {
  const artist = pickBestArtistMatch(candidates, artistName);
  if (!artist) {
    return null;
  }

  const exact = artistNamesMatchExactly(artist.name, artistName);
  return {
    artist,
    confidence: exact ? "exact" : "fuzzy",
    status: exact ? "auto" : "needs_review",
  };
}

/**
 * Spotify artist ids are base62 (letters + digits), same shape as track ids. Validating before a
 * value reaches an iframe `src` blocks any tainted-data path into the URL sink (defense-in-depth
 * XSS guard, PRD 17 discipline). Mirrors isSafeSpotifyTrackId in lib/shared-songs-core.ts.
 */
export function isSafeSpotifyArtistId(artistId: string): boolean {
  return typeof artistId === "string" && /^[A-Za-z0-9]+$/.test(artistId);
}

/** Build the canonical Spotify artist embed URL from a VALIDATED id (call the guard first). */
export function spotifyArtistEmbedUrl(artistId: string): string {
  return `https://open.spotify.com/embed/artist/${encodeURIComponent(artistId)}?utm_source=generator`;
}
