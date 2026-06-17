/**
 * Curator & Influencer Profiles — pure logic (PRD 25 / C3). No DB/network imports, so handle
 * validation, top-list derivation, and public-shaping are unit-tested in isolation
 * (tests/curators.test.ts) and reused by the service.
 *
 * A curator is an admin-promoted PUBLIC persona on top of an existing user. These helpers only
 * validate and shape; they never decide promotion (admin-only) and never expose private fields.
 */

export type CuratorStatus = "active" | "hidden";
export type CuratorPickStatus = "visible" | "hidden";

/** Public curator persona — deliberately omits user_id and any private/account field. */
export type PublicCurator = {
  handle: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
};

export type CuratorPickInput = {
  eventId: string;
  eventTitle: string;
  artistName?: string | null;
  venueName?: string | null;
  tags?: string[] | null;
  note: string | null;
};

export type CuratorTopListEntry = {
  kind: "artist" | "venue" | "genre";
  label: string;
  count: number;
};

/** Compact "curated by" signal for the board / event detail (a curator's public persona). */
export type CuratedBy = {
  handle: string;
  displayName: string;
};

const HANDLE_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{1,38}[a-z0-9])$/;
const MAX_BIO = 600;
const MAX_DISPLAY_NAME = 80;

/** Normalize a raw handle to the stored form (lowercased, trimmed). Does not validate. */
export function normalizeHandle(raw: string): string {
  return (raw ?? "").trim().toLowerCase();
}

/**
 * URL-safe handle rule: 3–40 chars, lowercase letters/digits/`-`/`_`, must start and end
 * alphanumeric. Blocks path traversal, spaces, and uppercase before a handle reaches a route.
 */
export function isValidHandle(raw: string): boolean {
  const handle = normalizeHandle(raw);
  return HANDLE_PATTERN.test(handle);
}

/** Clean a display name to a bounded, non-empty string (falls back to the handle). */
export function cleanDisplayName(raw: string | null | undefined, handle: string): string {
  const trimmed = (raw ?? "").trim().slice(0, MAX_DISPLAY_NAME);
  return trimmed || handle;
}

/** Clean an optional bio to a bounded string or null. */
export function cleanBio(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim().slice(0, MAX_BIO);
  return trimmed || null;
}

/**
 * Derive a curator's top-list from their visible picks' event metadata: the most-picked artists,
 * venues, and genres/tags. Pure aggregation over rows the caller resolved (picks joined to live
 * events); tolerates missing metadata (re-ingested-away events) by skipping blank values.
 */
export function buildCuratorTopList(
  picks: CuratorPickInput[],
  limitPerKind = 5
): CuratorTopListEntry[] {
  const counters: Record<CuratorTopListEntry["kind"], Map<string, number>> = {
    artist: new Map(),
    venue: new Map(),
    genre: new Map(),
  };

  for (const pick of picks) {
    bump(counters.artist, pick.artistName);
    bump(counters.venue, pick.venueName);
    for (const tag of pick.tags ?? []) {
      bump(counters.genre, tag);
    }
  }

  const entries: CuratorTopListEntry[] = [];
  for (const kind of ["artist", "venue", "genre"] as const) {
    const top = Array.from(counters[kind].entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limitPerKind)
      .map(([label, count]) => ({ kind, label, count }));
    entries.push(...top);
  }
  return entries;
}

function bump(counter: Map<string, number>, value: string | null | undefined) {
  const label = (value ?? "").trim();
  if (!label) {
    return;
  }
  counter.set(label, (counter.get(label) ?? 0) + 1);
}
