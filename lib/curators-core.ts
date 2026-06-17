/**
 * Curator & Influencer Profiles — pure logic (PRD 25 / C3). No DB/network imports, so handle
 * validation, top-list derivation, and public-shaping are unit-tested in isolation
 * (tests/curators.test.ts) and reused by the service.
 *
 * A curator is an admin-promoted PUBLIC persona on top of an existing user. These helpers only
 * validate and shape; they never decide promotion (admin-only) and never expose private fields.
 */

/**
 * Stored lifecycle of a curator row. `active`/`hidden` are the admin-controlled states (PRD 25);
 * `pending`/`rejected` are the self-serve onboarding states (PRD 29). Public reads only ever expose
 * `active` rows, so `pending`/`rejected` are invisible by construction.
 */
export type CuratorStatus = "active" | "hidden" | "pending" | "rejected";
export type CuratorPickStatus = "visible" | "hidden";

/** What a signed-in listener sees about their OWN curator standing — `none` = no row yet (PRD 29). */
export type CuratorSelfStatus = "none" | CuratorStatus;

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
const MAX_APPLICATION_NOTE = 600;

/**
 * Self-serve promotion gate (PRD 29). Self-serve curator promotion is INSTANT while the platform is
 * small and falls back to an admin-reviewed `pending` queue once it crosses either limit — the
 * primary anti-spam valve. Defaults are tunable and recorded in the roadmap's Scaling Milestones
 * table; tune against real signups rather than guessing.
 */
export type SelfServeGate = { maxCurators: number; maxUsers: number };
export const CURATOR_SELF_SERVE_GATE: SelfServeGate = { maxCurators: 25, maxUsers: 250 };

/**
 * Is self-serve promotion still INSTANT? Open only while strictly under BOTH limits; crossing
 * either (`>= maxCurators` active curators OR `>= maxUsers` users) closes the gate, routing new
 * applications to admin review. Pure + unit-tested so the spam valve is provable, not guessed.
 */
export function isSelfServeOpen(
  activeCuratorCount: number,
  userCount: number,
  gate: SelfServeGate = CURATOR_SELF_SERVE_GATE
): boolean {
  return activeCuratorCount < gate.maxCurators && userCount < gate.maxUsers;
}

/** Clean an optional self-serve application note (the pitch) to a bounded string or null. */
export function cleanApplicationNote(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim().slice(0, MAX_APPLICATION_NOTE);
  return trimmed || null;
}

/** Minimum interval between self-serve handle changes (PRD 33 anti-abuse): one change per 24h. */
export const HANDLE_CHANGE_MIN_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * May a curator change their handle now (PRD 33)? Bounded to one change per `minIntervalMs` to stop
 * handle churn / squatting. A null/unparseable last-change time is treated as "never changed" → allowed.
 * Pure so the rate limit is unit-tested rather than guessed.
 */
export function canChangeHandle(
  lastChangedAt: Date | string | null | undefined,
  now: Date = new Date(),
  minIntervalMs: number = HANDLE_CHANGE_MIN_INTERVAL_MS
): boolean {
  if (!lastChangedAt) {
    return true;
  }
  const last = lastChangedAt instanceof Date ? lastChangedAt : new Date(lastChangedAt);
  if (Number.isNaN(last.getTime())) {
    return true;
  }
  return now.getTime() - last.getTime() >= minIntervalMs;
}

/**
 * A curator is "activated" (PRD 32) once they have at least one visible pick — only then are they a
 * useful, directory-ranked entry rather than an empty profile. Pure so both the curator's own
 * not-activated nudge and the C5 admin oversight read agree on the definition.
 */
export function isCuratorActivated(visiblePickCount: number): boolean {
  return visiblePickCount >= 1;
}

/**
 * Self-management (PRD 31) is allowed only on an ACTIVE curator row. An admin-`hidden`, `pending`,
 * or `rejected` row must be restored/approved by an admin before the curator can edit persona or
 * manage picks — admin moderation always overrides. Pure so the rule is provably enforced.
 */
export function canSelfManageCurator(status: CuratorStatus): boolean {
  return status === "active";
}

const MAX_AVATAR_URL = 500;

/**
 * Clean an optional avatar URL. Only bounded, well-formed `https:` URLs survive — a self-authored
 * field (PRD 29) must not become an SSRF/`javascript:`/`data:` vector when later rendered as an
 * `<img src>`. Anything else (including `http:`) collapses to null.
 */
export function cleanAvatarUrl(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? "").trim().slice(0, MAX_AVATAR_URL);
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

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
