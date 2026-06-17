// Pure helpers for Shared Listening (PRD 17 / Phase 9 C1). No DB or network imports so this
// stays unit-testable in isolation (see tests/shared-songs.test.ts), mirroring lib/genre-taxonomy.ts.

export type SharedSongStatus = "visible" | "hidden" | "pending";

/**
 * Window event dispatched (client-side) after a signed-in listener Goes/Fires, so any mounted
 * shared-song surface for that event re-fetches and shows the freshly seeded tracks.
 */
export const SHARED_SONGS_REFRESH_EVENT = "avlmc:shared-songs-refresh";

/** App-facing shared song. Deliberately omits `seeded_by_user_id` so it can never leak. */
export type SharedSong = {
  id: string;
  eventId: string;
  provider: "spotify";
  providerTrackId: string;
  name: string;
  artistNames: string[];
  externalUrl: string | null;
  imageUrl: string | null;
  previewUrl: string | null;
  shareCount: number;
  status: SharedSongStatus;
};

/** Public, render-ready shared song: adds the embed URL and the per-viewer overlap badge. */
export type PublicSharedSong = Omit<SharedSong, "status"> & {
  embedUrl: string;
  youAlreadyLove: boolean;
  /**
   * Inner-circle attribution (PRD 24 / C2): the seeder's display name, attached ONLY for a signed-in
   * viewer who follows the seeder and whose seeder opted into sharing. Absent (undefined) on the
   * anonymous/public path, which stays the PRD 17 unattributed shape. Never the raw seeded_by_user_id.
   */
  sharedBy?: string | null;
};

export type SharedSongSeed = {
  providerTrackId: string;
  name: string;
  artistNames: string[];
  externalUrl: string | null;
  imageUrl: string | null;
  previewUrl: string | null;
};

type ArtistTopTrackLike = {
  providerItemId: string;
  name: string;
  artistNames: string[];
  externalUrl: string;
  imageUrl: string | null;
  previewUrl: string | null;
};

type ViewerTrackLike = {
  providerItemId: string;
  name: string;
  artistNames: string[];
};

/** How many of an artist's top tracks we seed per share (Spotify returns up to 10). */
export const MAX_SHARED_SONGS_PER_SEED = 10;

/** Build the canonical Spotify track embed URL. */
export function spotifyEmbedUrl(providerTrackId: string): string {
  return `https://open.spotify.com/embed/track/${encodeURIComponent(providerTrackId)}`;
}

/**
 * Spotify track ids are base62 (letters + digits). Validating before a value reaches an
 * iframe `src` blocks any tainted-data path into the URL sink (defense-in-depth XSS guard).
 */
export function isSafeSpotifyTrackId(providerTrackId: string): boolean {
  return /^[A-Za-z0-9]+$/.test(providerTrackId);
}

/** Dedupe an artist's top tracks by track id and cap the count, ready for upsert. */
export function mapArtistTopTracksToSeeds(tracks: ArtistTopTrackLike[]): SharedSongSeed[] {
  const seen = new Set<string>();
  const seeds: SharedSongSeed[] = [];

  for (const track of tracks) {
    if (!track.providerItemId || !track.name || seen.has(track.providerItemId)) {
      continue;
    }
    seen.add(track.providerItemId);
    seeds.push({
      providerTrackId: track.providerItemId,
      name: track.name,
      artistNames: track.artistNames,
      externalUrl: track.externalUrl,
      imageUrl: track.imageUrl,
      previewUrl: track.previewUrl,
    });
    if (seeds.length >= MAX_SHARED_SONGS_PER_SEED) {
      break;
    }
  }

  return seeds;
}

function trackMatchKey(name: string, artistNames: string[]): string {
  const artist = (artistNames[0] ?? "").trim().toLowerCase();
  return `${name.trim().toLowerCase()}::${artist}`;
}

/**
 * Set of `providerTrackId`s the viewer already loves — matched by Spotify track id, with a
 * normalized name+artist fallback. Drives the "you already love this one" badge. Pure: the
 * viewer's taste is read by the caller and only ever surfaced back to that same viewer.
 */
export function computeViewerOverlap(
  songs: Array<{ providerTrackId: string; name: string; artistNames: string[] }>,
  viewerTopTracks: ViewerTrackLike[]
): Set<string> {
  const lovedIds = new Set<string>();
  const lovedKeys = new Set<string>();

  for (const track of viewerTopTracks) {
    if (track.providerItemId) {
      lovedIds.add(track.providerItemId);
    }
    lovedKeys.add(trackMatchKey(track.name, track.artistNames));
  }

  const matched = new Set<string>();
  for (const song of songs) {
    if (lovedIds.has(song.providerTrackId) || lovedKeys.has(trackMatchKey(song.name, song.artistNames))) {
      matched.add(song.providerTrackId);
    }
  }

  return matched;
}

/** Project a shared song into its public, render-ready shape (no status, with embed + badge). */
export function toPublicSharedSong(song: SharedSong, lovedTrackIds: Set<string>): PublicSharedSong {
  const { status, ...rest } = song;
  void status;
  return {
    ...rest,
    embedUrl: spotifyEmbedUrl(song.providerTrackId),
    youAlreadyLove: lovedTrackIds.has(song.providerTrackId),
  };
}
