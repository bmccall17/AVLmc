import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";
import {
  getSpotifyArtistTopTracks,
  listMusicConnections,
  listMusicProfileItems,
} from "@/lib/music";
import {
  computeViewerOverlap,
  mapArtistTopTracksToSeeds,
  toPublicSharedSong,
  type PublicSharedSong,
  type SharedSong,
  type SharedSongStatus,
} from "@/lib/shared-songs-core";

export type { PublicSharedSong, SharedSong, SharedSongStatus } from "@/lib/shared-songs-core";

export type SharedSongSummary = {
  count: number;
  thumbnails: string[];
};

type SharedSongRow = {
  id: string;
  event_id: string;
  provider: "spotify";
  provider_track_id: string;
  name: string;
  artist_names: string[] | string | null;
  external_url: string | null;
  image_url: string | null;
  preview_url: string | null;
  share_count: number | string;
  status: SharedSongStatus;
};

// Columns selected into the app — `seeded_by_user_id` is intentionally never read out so it
// cannot leak into any response (it exists only for a future inner-circle attribution layer).
const SHARED_SONG_COLUMNS = `
  id, event_id, provider, provider_track_id, name, artist_names,
  external_url, image_url, preview_url, share_count, status
`;

/**
 * Seed an event's artist top tracks into the public shared list (PRD 17). Best-effort: the
 * caller wraps this so a Spotify failure never breaks the Going/Fire action. Gated on an
 * active (non-disconnected) Spotify connection; deduped/strengthened via upsert.
 */
export async function seedSharedSongsForEvent(input: {
  event: { id: string; eventTitle: string; artistName: string };
  userId: string;
}): Promise<void> {
  const connections = await listMusicConnections(input.userId);
  const connected = connections.some(
    (connection) => connection.provider === "spotify" && !connection.disconnectedAt
  );
  if (!connected) {
    return;
  }

  const tracks = await getSpotifyArtistTopTracks(input.userId, input.event.artistName);
  const seeds = mapArtistTopTracksToSeeds(tracks);
  if (seeds.length === 0) {
    return;
  }

  const seededByUserId = toNullableUserId(input.userId);

  await Promise.all(
    seeds.map((seed) =>
      query(
        `
          insert into public.event_shared_songs (
            id, event_id, event_title, provider, provider_track_id, name, artist_names,
            external_url, image_url, preview_url, seeded_by_user_id
          )
          values ($1, $2, $3, 'spotify', $4, $5, $6, $7, $8, $9, $10)
          on conflict (event_id, provider, provider_track_id) do update
            set share_count = public.event_shared_songs.share_count + 1,
              last_shared_at = now(),
              name = excluded.name,
              artist_names = excluded.artist_names,
              external_url = excluded.external_url,
              image_url = excluded.image_url,
              preview_url = excluded.preview_url
        `,
        [
          randomUUID(),
          input.event.id,
          input.event.eventTitle,
          seed.providerTrackId,
          seed.name,
          seed.artistNames,
          seed.externalUrl,
          seed.imageUrl,
          seed.previewUrl,
          seededByUserId,
        ]
      )
    )
  );
}

/**
 * Public shared-song list for an event: visible-only, never attributed. When a signed-in
 * viewer is provided, their own top tracks badge matching rows ("you already love this one").
 */
export async function listPublicSharedSongs(
  eventId: string,
  viewerUserId?: string | null
): Promise<PublicSharedSong[]> {
  const songs = await listVisibleSharedSongs(eventId);
  if (songs.length === 0) {
    return [];
  }

  const lovedTrackIds = await computeViewerLovedTrackIds(songs, viewerUserId);
  return songs.map((song) => toPublicSharedSong(song, lovedTrackIds));
}

/** Compact per-event summaries (count + a few cover thumbnails) for the homepage board cards. */
export async function getSharedSongSummariesByEvent(
  eventIds: string[]
): Promise<Record<string, SharedSongSummary>> {
  const uniqueIds = Array.from(new Set(eventIds)).filter(Boolean);
  if (uniqueIds.length === 0) {
    return {};
  }

  const result = await query<SharedSongRow>(
    `
      select ${SHARED_SONG_COLUMNS}
      from public.event_shared_songs
      where event_id = any($1::text[])
        and status = 'visible'
      order by event_id, share_count desc, first_shared_at asc
    `,
    [uniqueIds]
  );

  const summaries: Record<string, SharedSongSummary> = {};
  for (const row of result.rows) {
    const summary = (summaries[row.event_id] ??= { count: 0, thumbnails: [] });
    summary.count += 1;
    if (row.image_url && summary.thumbnails.length < 3) {
      summary.thumbnails.push(row.image_url);
    }
  }

  return summaries;
}

/** Admin listing (includes hidden rows). Still never reads `seeded_by_user_id`. */
export async function listSharedSongsForAdmin(eventId?: string): Promise<SharedSong[]> {
  const result = await query<SharedSongRow>(
    `
      select ${SHARED_SONG_COLUMNS}
      from public.event_shared_songs
      where ($1::text is null or event_id = $1)
      order by last_shared_at desc
    `,
    [eventId ?? null]
  );

  return result.rows.map(mapSharedSongRow);
}

export async function setSharedSongStatus(
  id: string,
  status: SharedSongStatus
): Promise<SharedSong | null> {
  const result = await query<SharedSongRow>(
    `
      update public.event_shared_songs
      set status = $2
      where id = $1
      returning ${SHARED_SONG_COLUMNS}
    `,
    [id, status]
  );

  return result.rows[0] ? mapSharedSongRow(result.rows[0]) : null;
}

async function listVisibleSharedSongs(eventId: string): Promise<SharedSong[]> {
  const result = await query<SharedSongRow>(
    `
      select ${SHARED_SONG_COLUMNS}
      from public.event_shared_songs
      where event_id = $1
        and status = 'visible'
      order by share_count desc, first_shared_at asc
    `,
    [eventId]
  );

  return result.rows.map(mapSharedSongRow);
}

async function computeViewerLovedTrackIds(
  songs: SharedSong[],
  viewerUserId?: string | null
): Promise<Set<string>> {
  if (!viewerUserId) {
    return new Set();
  }

  const profileItems = await listMusicProfileItems(viewerUserId);
  const viewerTopTracks = profileItems
    .filter((item) => item.provider === "spotify" && item.itemType === "top_track")
    .map((item) => ({
      providerItemId: item.providerItemId,
      name: item.name,
      artistNames: item.artistNames,
    }));

  return computeViewerOverlap(songs, viewerTopTracks);
}

function mapSharedSongRow(row: SharedSongRow): SharedSong {
  return {
    id: row.id,
    eventId: row.event_id,
    provider: row.provider,
    providerTrackId: row.provider_track_id,
    name: row.name,
    artistNames: toStringArray(row.artist_names),
    externalUrl: row.external_url,
    imageUrl: row.image_url,
    previewUrl: row.preview_url,
    shareCount: Number(row.share_count ?? 0),
    status: row.status,
  };
}

function toStringArray(value: string[] | string | null): string[] {
  if (Array.isArray(value)) {
    return value;
  }
  return value ? [value] : [];
}

function toNullableUserId(userId: string | null | undefined): number | null {
  if (!userId) {
    return null;
  }
  const parsed = Number(userId);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
