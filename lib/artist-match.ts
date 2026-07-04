import "server-only";
import { randomUUID } from "node:crypto";
import {
  decideArtistMatch,
  isPublishedArtistMatchStatus,
  isSafeSpotifyArtistId,
  normalizeArtistName,
  spotifyArtistEmbedUrl,
  type ArtistMatchConfidence,
  type ArtistMatchStatus,
} from "@/lib/artist-match-core";
import { query } from "@/lib/db";
import {
  getSpotifyArtistTopTracksApp,
  searchSpotifyArtistsApp,
  SpotifyAppTokenError,
} from "@/lib/spotify-app-token";

/**
 * Artist matcher service (PRD 46, Story B/C/D). Resolves an event's `artist_name` to a Spotify
 * artist with the app-only token, persists the match (exact → auto-publish; fuzzy → needs_review),
 * caches per normalized name so repeat artists never re-hit the API, and reads matches back for
 * the event-detail embed, the board hover-play playlist, and the admin review queue.
 *
 * Every read/write tolerates a not-yet-migrated database (Postgres 42P01) and degrades to empty,
 * mirroring lib/shared-songs.ts — the artist embed and board simply go silent until the migration
 * lands, and matches never fail event ingestion.
 */

export type ArtistTrack = {
  providerTrackId: string;
  name: string;
  artistNames: string[];
  previewUrl: string | null;
  imageUrl: string | null;
  externalUrl: string | null;
};

export type ArtistMatch = {
  id: string;
  eventId: string;
  artistName: string;
  normalizedName: string;
  provider: "spotify";
  spotifyArtistId: string | null;
  spotifyArtistName: string | null;
  spotifyArtistImageUrl: string | null;
  confidence: ArtistMatchConfidence | null;
  status: ArtistMatchStatus;
  matchedAt: string;
  updatedAt: string;
};

/** A published artist match plus its cached tracks — the event-detail embed payload. */
export type PublishedArtistMatch = ArtistMatch & {
  spotifyArtistId: string;
  embedUrl: string;
  tracks: ArtistTrack[];
};

type ArtistMatchRow = {
  id: string;
  event_id: string;
  artist_name: string;
  normalized_name: string;
  provider: "spotify";
  spotify_artist_id: string | null;
  spotify_artist_name: string | null;
  spotify_artist_image_url: string | null;
  confidence: ArtistMatchConfidence | null;
  status: ArtistMatchStatus;
  matched_at: Date | string;
  updated_at: Date | string;
};

type ArtistTrackRow = {
  event_id: string;
  provider_track_id: string;
  name: string;
  artist_names: string[] | string | null;
  preview_url: string | null;
  image_url: string | null;
  external_url: string | null;
  rank: number | string;
};

const MATCH_COLUMNS = `
  id, event_id, artist_name, normalized_name, provider, spotify_artist_id,
  spotify_artist_name, spotify_artist_image_url, confidence, status, matched_at, updated_at
`;

/** How many of the matched artist's top tracks we cache for hover-play / the fallback list. */
const MAX_ARTIST_TRACKS = 10;

export type ResolveOutcome =
  | { result: "exists" }
  | { result: "cached"; status: ArtistMatchStatus }
  | {
      result: "matched";
      status: ArtistMatchStatus;
      confidence: ArtistMatchConfidence;
      /** Set when the match published but its top-tracks fetch failed (non-fatal). */
      trackError?: string;
    }
  | { result: "rejected" }
  | { result: "skipped"; reason: string }
  | { result: "error"; reason: string };

/**
 * Fetch + store an artist's top tracks, swallowing a Spotify failure (returns the reason string)
 * instead of throwing — so a top-tracks outage never blocks the embed. The reason is logged so the
 * actual HTTP status shows up in runtime logs (this is how we learn whether previews/top-tracks are
 * even available for our app under Development Mode — the Story A spike question).
 */
async function safeFetchAndStoreArtistTracks(
  eventId: string,
  spotifyArtistId: string
): Promise<string | undefined> {
  try {
    await fetchAndStoreArtistTracks(eventId, spotifyArtistId);
    return undefined;
  } catch (error) {
    if (error instanceof SpotifyAppTokenError) {
      const reason = error.status ? `spotify ${error.status}` : error.message;
      // eslint-disable-next-line no-console
      console.warn(`artist top-tracks fetch failed for event ${eventId} (${spotifyArtistId}): ${reason}`);
      return reason;
    }
    throw error;
  }
}

/**
 * Resolve + persist one event's artist match. Idempotent and stable: an event that already has a
 * row is left untouched (matches don't change, so ingestion/backfill re-runs are no-ops). Cache
 * hit by normalized name reuses a prior resolution with zero API calls. Only exact matches publish
 * an embed and cache tracks; fuzzy matches land in `needs_review` with no tracks (no embed, no
 * audio — a wrong artist is worse than none).
 */
export async function resolveAndStoreArtistMatch(input: {
  eventId: string;
  artistName: string;
  /** When true, skip the top-tracks fetch (caller already learned it's forbidden this run). */
  skipTracks?: boolean;
}): Promise<ResolveOutcome> {
  const artistName = input.artistName?.trim() ?? "";
  const normalizedName = normalizeArtistName(artistName);

  try {
    const existing = await readArtistMatchRow(input.eventId);
    if (existing) {
      return { result: "exists" };
    }

    if (normalizedName.length === 0) {
      return { result: "skipped", reason: "empty artist name" };
    }

    // Cache: reuse a prior resolution for the same normalized name (weekly residencies, runs).
    const cached = await findCachedResolution(normalizedName);
    if (cached) {
      await writeArtistMatch({
        eventId: input.eventId,
        artistName,
        normalizedName,
        spotifyArtistId: cached.spotifyArtistId,
        spotifyArtistName: cached.spotifyArtistName,
        spotifyArtistImageUrl: cached.spotifyArtistImageUrl,
        confidence: cached.confidence,
        status: cached.status,
      });
      if (cached.status === "auto" && cached.spotifyArtistId) {
        const tracks = await copyCachedTracks(cached.sourceEventId, input.eventId);
        if (tracks === 0 && !input.skipTracks) {
          // Source had no cached tracks (older row); fetch once so this event still hovers/plays.
          await safeFetchAndStoreArtistTracks(input.eventId, cached.spotifyArtistId);
        }
      }
      return { result: "cached", status: cached.status };
    }

    // Live resolution via the app token.
    const candidates = await searchSpotifyArtistsApp(artistName);
    const decision = decideArtistMatch(candidates, artistName);

    if (!decision) {
      // No hit at all — tombstone so backfill/ingestion won't re-hit the API for this event.
      await writeArtistMatch({
        eventId: input.eventId,
        artistName,
        normalizedName,
        spotifyArtistId: null,
        spotifyArtistName: null,
        spotifyArtistImageUrl: null,
        confidence: null,
        status: "rejected",
      });
      return { result: "rejected" };
    }

    await writeArtistMatch({
      eventId: input.eventId,
      artistName,
      normalizedName,
      spotifyArtistId: decision.artist.id,
      spotifyArtistName: decision.artist.name,
      spotifyArtistImageUrl: decision.artist.imageUrl ?? null,
      confidence: decision.confidence,
      status: decision.status,
    });

    // Only publish tracks for auto (exact) matches — fuzzy/needs_review stays silent until review.
    // Track fetch is NON-FATAL: the embed (primary deliverable) publishes regardless; a failed
    // top-tracks call just means no hover-play previews yet, which a later top-up pass retries.
    let trackError: string | undefined;
    if (decision.status === "auto" && !input.skipTracks) {
      trackError = await safeFetchAndStoreArtistTracks(input.eventId, decision.artist.id);
    }

    return {
      result: "matched",
      status: decision.status,
      confidence: decision.confidence,
      trackError,
    };
  } catch (error) {
    if (isMissingRelationError(error)) {
      return { result: "skipped", reason: "table not migrated" };
    }
    if (error instanceof SpotifyAppTokenError) {
      // Surface the status so the backfill can back off on 429/5xx and resume later.
      const reason = error.status ? `spotify ${error.status}` : error.message;
      return { result: "error", reason };
    }
    throw error;
  }
}

/** The published (embeddable) match for an event, with its cached tracks. Null when none/held. */
export async function getPublishedArtistMatch(
  eventId: string
): Promise<PublishedArtistMatch | null> {
  const row = await readArtistMatchRow(eventId);
  if (!row) {
    return null;
  }
  const match = mapMatchRow(row);
  if (
    !match.spotifyArtistId ||
    !isSafeSpotifyArtistId(match.spotifyArtistId) ||
    !isPublishedArtistMatchStatus(match.status)
  ) {
    return null;
  }

  const tracks = await listArtistTracks(eventId);
  return {
    ...match,
    spotifyArtistId: match.spotifyArtistId,
    embedUrl: spotifyArtistEmbedUrl(match.spotifyArtistId),
    tracks,
  };
}

/** Any match row for an event (published or not) — drives the correction affordance state. */
export async function getArtistMatchForEvent(eventId: string): Promise<ArtistMatch | null> {
  const row = await readArtistMatchRow(eventId);
  return row ? mapMatchRow(row) : null;
}

/**
 * Per-event count of cached, playable (preview-bearing) artist tracks, for the board's listenable
 * chip. Only published matches have tracks, so an unpublished/needs_review event contributes 0.
 */
export async function getArtistTrackCountsByEvent(
  eventIds: string[]
): Promise<Record<string, number>> {
  const uniqueIds = Array.from(new Set(eventIds)).filter(Boolean);
  if (uniqueIds.length === 0) {
    return {};
  }
  try {
    const result = await query<{ event_id: string; count: number | string }>(
      `
        select event_id, count(*)::int as count
        from public.event_artist_tracks
        where event_id = any($1::text[])
        group by event_id
      `,
      [uniqueIds]
    );
    const counts: Record<string, number> = {};
    for (const row of result.rows) {
      counts[row.event_id] = Number(row.count ?? 0);
    }
    return counts;
  } catch (error) {
    if (isMissingRelationError(error)) {
      return {};
    }
    throw error;
  }
}

/** Ordered hover-play playlist for one event — cached artist tracks with a usable preview URL. */
export async function getPlayableArtistTracks(eventId: string): Promise<ArtistTrack[]> {
  const tracks = await listArtistTracks(eventId);
  return tracks.filter((track) => Boolean(track.previewUrl));
}

/* ------------------------------------------------------------------ */
/*  Backfill + ingestion hook                                          */
/* ------------------------------------------------------------------ */

export type ArtistMatchBackfillSummary = {
  processed: number;
  matched: number;
  cached: number;
  needsReview: number;
  rejected: number;
  errors: number;
  /** Published matches whose top-tracks fetch failed this run (non-fatal — embed still works). */
  tracksFailed: number;
  /** Published matches that were missing tracks and got them filled by the top-up pass. */
  tracksFilled: number;
  /** The most recent track-fetch failure reason (e.g. "spotify 403") for quick diagnosis. */
  lastTrackError?: string;
  remaining: number;
  /** True when a Spotify 429/5xx made us stop early — the next run resumes where this left off. */
  backedOff: boolean;
};

/**
 * Resolve artist matches for events that don't yet have a row (matches are stable, so events with
 * a row are skipped — a re-run is a no-op). Batched and rate-respectful: pauses briefly between
 * live API calls and backs off on a Spotify 429/5xx, persisting partial progress so the next run
 * resumes. Powers both the ingestion hook (small `limit`) and `scripts/backfill-artist-matches.ts`
 * (looped until `remaining` is 0). Degrades to a no-op if the tables aren't migrated.
 */
export async function runArtistMatchBackfill(options: {
  limit?: number;
  pauseMs?: number;
} = {}): Promise<ArtistMatchBackfillSummary> {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 500));
  const pauseMs = options.pauseMs ?? 150;
  const summary: ArtistMatchBackfillSummary = {
    processed: 0,
    matched: 0,
    cached: 0,
    needsReview: 0,
    rejected: 0,
    errors: 0,
    tracksFailed: 0,
    tracksFilled: 0,
    remaining: 0,
    backedOff: false,
  };

  let pending: Array<{ id: string; artist_name: string }>;
  try {
    const result = await query<{ id: string; artist_name: string }>(
      `
        select e.id, e.artist_name
        from public.events e
        left join public.event_artist_matches m
          on m.event_id = e.id and m.provider = 'spotify'
        where m.event_id is null
        order by e.event_date desc
        limit $1
      `,
      [limit]
    );
    pending = result.rows;
  } catch (error) {
    if (isMissingRelationError(error)) {
      return summary;
    }
    throw error;
  }

  // Once top-tracks returns 403 (Spotify's app-wide Dev-Mode restriction), stop attempting it for
  // the rest of the run — retrying every artist just burns quota on the same 403.
  let tracksForbidden = false;

  for (const event of pending) {
    const outcome = await resolveAndStoreArtistMatch({
      eventId: event.id,
      artistName: event.artist_name,
      skipTracks: tracksForbidden,
    });
    summary.processed += 1;

    switch (outcome.result) {
      case "cached":
        summary.cached += 1;
        if (outcome.status === "needs_review") {
          summary.needsReview += 1;
        }
        break;
      case "matched":
        summary.matched += 1;
        if (outcome.status === "needs_review") {
          summary.needsReview += 1;
        }
        if (outcome.trackError) {
          summary.tracksFailed += 1;
          summary.lastTrackError = outcome.trackError;
          if (/\b403\b/.test(outcome.trackError)) {
            tracksForbidden = true;
          }
        }
        break;
      case "rejected":
        summary.rejected += 1;
        break;
      case "error":
        summary.errors += 1;
        // A Spotify 429/5xx means rate-limited/degraded — stop and let the next run resume.
        if (/\b(429|5\d\d)\b/.test(outcome.reason)) {
          summary.backedOff = true;
        }
        break;
      default:
        break;
    }

    if (summary.backedOff) {
      break;
    }
    if (pauseMs > 0) {
      await sleep(pauseMs);
    }
  }

  // Top-up: retry top-tracks for already-published matches that still have no tracks (e.g. a
  // prior top-tracks outage). Independent of the match row, so a fixed root cause fills previews
  // on the next run without deleting/redoing matches. Skipped when top-tracks is 403 this run —
  // no point re-hammering an app-wide restriction.
  if (!summary.backedOff && !tracksForbidden) {
    const topUp = await backfillMissingArtistTracks({ limit, pauseMs });
    summary.tracksFilled += topUp.filled;
    summary.tracksFailed += topUp.errors;
    if (topUp.lastError) {
      summary.lastTrackError = topUp.lastError;
    }
    if (topUp.backedOff) {
      summary.backedOff = true;
    }
  }

  summary.remaining = await countUnmatchedEvents();
  return summary;
}

/**
 * Retry top-tracks for published matches (auto/confirmed/replaced) that currently have zero cached
 * tracks. Decoupled from match resolution so hover-play previews can be filled after a transient
 * top-tracks outage without touching the match rows.
 */
export async function backfillMissingArtistTracks(options: {
  limit?: number;
  pauseMs?: number;
} = {}): Promise<{ attempted: number; filled: number; errors: number; lastError?: string; backedOff: boolean }> {
  const limit = Math.max(1, Math.min(options.limit ?? 50, 500));
  const pauseMs = options.pauseMs ?? 150;
  const result = { attempted: 0, filled: 0, errors: 0, lastError: undefined as string | undefined, backedOff: false };

  let rows: Array<{ event_id: string; spotify_artist_id: string }>;
  try {
    const query_result = await query<{ event_id: string; spotify_artist_id: string }>(
      `
        select m.event_id, m.spotify_artist_id
        from public.event_artist_matches m
        left join public.event_artist_tracks t on t.event_id = m.event_id
        where m.provider = 'spotify'
          and m.spotify_artist_id is not null
          and m.status in ('auto', 'confirmed', 'replaced')
          and t.event_id is null
        limit $1
      `,
      [limit]
    );
    rows = query_result.rows;
  } catch (error) {
    if (isMissingRelationError(error)) {
      return result;
    }
    throw error;
  }

  for (const row of rows) {
    if (!isSafeSpotifyArtistId(row.spotify_artist_id)) {
      continue;
    }
    result.attempted += 1;
    const error = await safeFetchAndStoreArtistTracks(row.event_id, row.spotify_artist_id);
    if (error) {
      result.errors += 1;
      result.lastError = error;
      // 429/5xx = back off and resume; 403 = app-wide top-tracks restriction, stop hammering it.
      if (/\b(429|5\d\d)\b/.test(error)) {
        result.backedOff = true;
        break;
      }
      if (/\b403\b/.test(error)) {
        break;
      }
    } else {
      result.filled += 1;
    }
    if (pauseMs > 0) {
      await sleep(pauseMs);
    }
  }

  return result;
}

/** Best-effort ingestion hook: match a small batch of freshly-ingested events. Never throws. */
export async function matchArtistsForNewEvents(limit = 25): Promise<ArtistMatchBackfillSummary | null> {
  try {
    return await runArtistMatchBackfill({ limit });
  } catch {
    // Matching must never break the sync/ingestion path.
    return null;
  }
}

async function countUnmatchedEvents(): Promise<number> {
  try {
    const result = await query<{ count: number | string }>(
      `
        select count(*)::int as count
        from public.events e
        left join public.event_artist_matches m
          on m.event_id = e.id and m.provider = 'spotify'
        where m.event_id is null
      `
    );
    return Number(result.rows[0]?.count ?? 0);
  } catch (error) {
    if (isMissingRelationError(error)) {
      return 0;
    }
    throw error;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------------------------------------------ */
/*  Admin / correction surface                                         */
/* ------------------------------------------------------------------ */

export async function listArtistMatchesForReview(): Promise<ArtistMatch[]> {
  try {
    const result = await query<ArtistMatchRow>(
      `
        select ${MATCH_COLUMNS}
        from public.event_artist_matches
        where status = 'needs_review'
        order by matched_at desc
        limit 200
      `
    );
    return result.rows.map(mapMatchRow);
  } catch (error) {
    if (isMissingRelationError(error)) {
      return [];
    }
    throw error;
  }
}

/** Flip a match's status (admin confirm/reject; listener flag → needs_review). */
export async function setArtistMatchStatus(
  eventId: string,
  status: ArtistMatchStatus
): Promise<ArtistMatch | null> {
  try {
    const result = await query<ArtistMatchRow>(
      `
        update public.event_artist_matches
        set status = $2, updated_at = now()
        where event_id = $1 and provider = 'spotify'
        returning ${MATCH_COLUMNS}
      `,
      [eventId, status]
    );
    return result.rows[0] ? mapMatchRow(result.rows[0]) : null;
  } catch (error) {
    if (isMissingRelationError(error)) {
      return null;
    }
    throw error;
  }
}

/**
 * Replace a match with a listener/admin-chosen artist (→ status `replaced`, publishes for
 * everyone). Re-fetches the new artist's top tracks so hover-play/fallback follow the correction.
 * The caller writes the audit row (spotify_event_match_corrections style).
 */
export async function replaceArtistMatch(input: {
  eventId: string;
  artistName: string;
  spotifyArtistId: string;
  spotifyArtistName: string | null;
  spotifyArtistImageUrl: string | null;
}): Promise<ArtistMatch | null> {
  if (!isSafeSpotifyArtistId(input.spotifyArtistId)) {
    return null;
  }
  const normalizedName = normalizeArtistName(input.artistName || input.spotifyArtistName || "");

  try {
    const result = await query<ArtistMatchRow>(
      `
        insert into public.event_artist_matches (
          id, event_id, artist_name, normalized_name, provider, spotify_artist_id,
          spotify_artist_name, spotify_artist_image_url, confidence, status
        )
        values ($1, $2, $3, $4, 'spotify', $5, $6, $7, 'exact', 'replaced')
        on conflict (event_id, provider) do update set
          spotify_artist_id = excluded.spotify_artist_id,
          spotify_artist_name = excluded.spotify_artist_name,
          spotify_artist_image_url = excluded.spotify_artist_image_url,
          confidence = 'exact',
          status = 'replaced',
          updated_at = now()
        returning ${MATCH_COLUMNS}
      `,
      [
        randomUUID(),
        input.eventId,
        input.artistName,
        normalizedName,
        input.spotifyArtistId,
        input.spotifyArtistName,
        input.spotifyArtistImageUrl,
      ]
    );
    if (!result.rows[0]) {
      return null;
    }
    // Refresh cached tracks to the corrected artist (best-effort — never fail the correction).
    try {
      await fetchAndStoreArtistTracks(input.eventId, input.spotifyArtistId, { replace: true });
    } catch (error) {
      if (!(error instanceof SpotifyAppTokenError)) {
        throw error;
      }
    }
    return mapMatchRow(result.rows[0]);
  } catch (error) {
    if (isMissingRelationError(error)) {
      return null;
    }
    throw error;
  }
}

/* ------------------------------------------------------------------ */
/*  Internal DB helpers                                                 */
/* ------------------------------------------------------------------ */

async function readArtistMatchRow(eventId: string): Promise<ArtistMatchRow | null> {
  const result = await query<ArtistMatchRow>(
    `
      select ${MATCH_COLUMNS}
      from public.event_artist_matches
      where event_id = $1 and provider = 'spotify'
      limit 1
    `,
    [eventId]
  );
  return result.rows[0] ?? null;
}

type CachedResolution = {
  sourceEventId: string;
  spotifyArtistId: string | null;
  spotifyArtistName: string | null;
  spotifyArtistImageUrl: string | null;
  confidence: ArtistMatchConfidence | null;
  status: ArtistMatchStatus;
};

/**
 * The best prior resolution for a normalized name: prefer a published, exact, resolved row so the
 * cache hit publishes. Ignores `rejected` tombstones so a no-hit on one event doesn't poison a
 * later event with the same name (they'd re-attempt live resolution instead).
 */
async function findCachedResolution(normalizedName: string): Promise<CachedResolution | null> {
  const result = await query<ArtistMatchRow>(
    `
      select ${MATCH_COLUMNS}
      from public.event_artist_matches
      where normalized_name = $1
        and provider = 'spotify'
        and spotify_artist_id is not null
        and status in ('auto', 'confirmed', 'replaced', 'needs_review')
      order by (status in ('auto', 'confirmed', 'replaced')) desc,
        (confidence = 'exact') desc,
        matched_at asc
      limit 1
    `,
    [normalizedName]
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return {
    sourceEventId: row.event_id,
    spotifyArtistId: row.spotify_artist_id,
    spotifyArtistName: row.spotify_artist_name,
    spotifyArtistImageUrl: row.spotify_artist_image_url,
    confidence: row.confidence,
    status: row.status,
  };
}

async function writeArtistMatch(input: {
  eventId: string;
  artistName: string;
  normalizedName: string;
  spotifyArtistId: string | null;
  spotifyArtistName: string | null;
  spotifyArtistImageUrl: string | null;
  confidence: ArtistMatchConfidence | null;
  status: ArtistMatchStatus;
}): Promise<void> {
  await query(
    `
      insert into public.event_artist_matches (
        id, event_id, artist_name, normalized_name, provider, spotify_artist_id,
        spotify_artist_name, spotify_artist_image_url, confidence, status
      )
      values ($1, $2, $3, $4, 'spotify', $5, $6, $7, $8, $9)
      on conflict (event_id, provider) do nothing
    `,
    [
      randomUUID(),
      input.eventId,
      input.artistName,
      input.normalizedName,
      input.spotifyArtistId,
      input.spotifyArtistName,
      input.spotifyArtistImageUrl,
      input.confidence,
      input.status,
    ]
  );
}

async function listArtistTracks(eventId: string): Promise<ArtistTrack[]> {
  try {
    const result = await query<ArtistTrackRow>(
      `
        select event_id, provider_track_id, name, artist_names, preview_url, image_url, external_url, rank
        from public.event_artist_tracks
        where event_id = $1
        order by rank asc
      `,
      [eventId]
    );
    return result.rows.map(mapTrackRow);
  } catch (error) {
    if (isMissingRelationError(error)) {
      return [];
    }
    throw error;
  }
}

async function fetchAndStoreArtistTracks(
  eventId: string,
  spotifyArtistId: string,
  options: { replace?: boolean } = {}
): Promise<void> {
  const tracks = await getSpotifyArtistTopTracksApp(spotifyArtistId);
  const capped = tracks.slice(0, MAX_ARTIST_TRACKS);

  if (options.replace) {
    await query(`delete from public.event_artist_tracks where event_id = $1`, [eventId]);
  }
  if (capped.length === 0) {
    return;
  }

  // One batched multi-row upsert; every value (including rank) is a bound placeholder — no
  // string interpolation reaches the SQL, so there is no injection surface.
  const params: unknown[] = [];
  const valueRows = capped.map((track, index) => {
    const base = index * 9;
    params.push(
      randomUUID(),
      eventId,
      track.providerItemId,
      track.name,
      track.artistNames,
      track.previewUrl,
      track.imageUrl,
      track.externalUrl,
      index
    );
    return `($${base + 1}, $${base + 2}, 'spotify', $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`;
  });

  await query(
    `
      insert into public.event_artist_tracks (
        id, event_id, provider, provider_track_id, name, artist_names,
        preview_url, image_url, external_url, rank
      )
      values ${valueRows.join(", ")}
      on conflict (event_id, provider, provider_track_id) do update set
        name = excluded.name,
        artist_names = excluded.artist_names,
        preview_url = excluded.preview_url,
        image_url = excluded.image_url,
        external_url = excluded.external_url,
        rank = excluded.rank
    `,
    params
  );
}

/** Copy a cached artist's tracks from a source event to a new event (cache hit path). */
async function copyCachedTracks(sourceEventId: string, targetEventId: string): Promise<number> {
  const result = await query(
    `
      insert into public.event_artist_tracks (
        id, event_id, provider, provider_track_id, name, artist_names,
        preview_url, image_url, external_url, rank
      )
      select gen_random_uuid()::text, $2, provider, provider_track_id, name, artist_names,
        preview_url, image_url, external_url, rank
      from public.event_artist_tracks
      where event_id = $1
      on conflict (event_id, provider, provider_track_id) do nothing
    `,
    [sourceEventId, targetEventId]
  );
  return result.rowCount ?? 0;
}

function mapMatchRow(row: ArtistMatchRow): ArtistMatch {
  return {
    id: row.id,
    eventId: row.event_id,
    artistName: row.artist_name,
    normalizedName: row.normalized_name,
    provider: row.provider,
    spotifyArtistId: row.spotify_artist_id,
    spotifyArtistName: row.spotify_artist_name,
    spotifyArtistImageUrl: row.spotify_artist_image_url,
    confidence: row.confidence,
    status: row.status,
    matchedAt: toIso(row.matched_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapTrackRow(row: ArtistTrackRow): ArtistTrack {
  return {
    providerTrackId: row.provider_track_id,
    name: row.name,
    artistNames: toStringArray(row.artist_names),
    previewUrl: row.preview_url,
    imageUrl: row.image_url,
    externalUrl: row.external_url,
  };
}

function toStringArray(value: string[] | string | null): string[] {
  if (Array.isArray(value)) {
    return value;
  }
  return value ? [value] : [];
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(String(value)).toISOString();
}

function isMissingRelationError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "42P01"
  );
}
