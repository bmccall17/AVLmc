import { randomUUID } from "node:crypto";
import { pickBestArtistMatch } from "@/lib/artist-match-core";
import { getAuthFeatureFlags } from "@/lib/auth-flags";
import { query } from "@/lib/db";
import { SpotifyLimitedBetaAccessError } from "@/lib/spotify-limited-access";
import {
  SpotifyReconnectRequiredError,
  isUnrecoverableRefreshResponse,
} from "@/lib/spotify-reconnect";

export type MusicProvider = "spotify" | "google_youtube" | "apple_music";
export type MusicProfileItemType = "top_artist" | "top_track";

export type MusicConnection = {
  provider: MusicProvider;
  scopes: string[];
  connectedAt: string;
  lastSyncedAt: string | null;
  tasteOptOutAt: string | null;
  disconnectedAt: string | null;
};

export type MusicProfileItem = {
  id: string;
  provider: MusicProvider;
  itemType: MusicProfileItemType;
  providerItemId: string;
  name: string;
  artistNames: string[];
  genres: string[];
  externalUrl: string | null;
  imageUrl: string | null;
  rank: number;
  timeRange: string;
  syncedAt: string;
};

export type SpotifyTrackSearchResult = {
  albumName: string | null;
  artistNames: string[];
  externalUrl: string;
  imageUrl: string | null;
  name: string;
  provider: "spotify";
  providerItemId: string;
};

export type SpotifyArtistSearchResult = {
  externalUrl: string;
  imageUrl: string | null;
  name: string;
  provider: "spotify";
  providerItemId: string;
};

export type SpotifyArtistTopTrack = {
  albumName: string | null;
  artistNames: string[];
  externalUrl: string;
  imageUrl: string | null;
  name: string;
  previewUrl: string | null;
  provider: "spotify";
  providerItemId: string;
};

type MusicConnectionRow = {
  provider: MusicProvider;
  scopes: string[] | string | null;
  connected_at: Date | string;
  last_synced_at: Date | string | null;
  taste_opt_out_at: Date | string | null;
  disconnected_at: Date | string | null;
};

type MusicProfileItemRow = {
  id: string;
  provider: MusicProvider;
  item_type: MusicProfileItemType;
  provider_item_id: string;
  name: string;
  artist_names: string[] | string | null;
  genres: string[] | string | null;
  external_url: string | null;
  image_url: string | null;
  rank: number;
  time_range: string;
  synced_at: Date | string;
};

type AccountRow = {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: number | string | null;
  scope: string | null;
};

type SpotifyTopArtistsResponse = {
  items?: Array<{
    id?: string;
    name?: string;
    genres?: string[];
    external_urls?: {
      spotify?: string;
    };
    images?: Array<{
      url?: string;
    }>;
  }>;
};

type SpotifyTopTracksResponse = {
  items?: Array<{
    id?: string;
    name?: string;
    external_urls?: {
      spotify?: string;
    };
    album?: {
      images?: Array<{
        url?: string;
      }>;
    };
    artists?: Array<{
      name?: string;
    }>;
  }>;
};

type SpotifySearchTracksResponse = {
  tracks?: {
    items?: Array<{
      album?: {
        images?: Array<{
          url?: string;
        }>;
        name?: string;
      };
      artists?: Array<{
        name?: string;
      }>;
      external_urls?: {
        spotify?: string;
      };
      id?: string;
      name?: string;
    } | null>;
  };
};

type SpotifySearchArtistsResponse = {
  artists?: {
    items?: Array<{
      external_urls?: {
        spotify?: string;
      };
      id?: string;
      images?: Array<{
        url?: string;
      }>;
      name?: string;
    } | null>;
  };
};

type SpotifyArtistTopTracksResponse = {
  tracks?: Array<{
    album?: {
      images?: Array<{
        url?: string;
      }>;
      name?: string;
    };
    artists?: Array<{
      name?: string;
    }>;
    external_urls?: {
      spotify?: string;
    };
    id?: string;
    name?: string;
    preview_url?: string | null;
  } | null>;
};

const SPOTIFY_TIME_RANGE = "medium_term";
// Imported-from-file taste (seat-free path). Kept in its own time_range so it never collides with the
// OAuth /me/top sync's `medium_term` rows — each source replaces only its own rows, and discovery's
// buildProfileTerms reads both and dedupes by artist name.
const IMPORT_TIME_RANGE = "import";

export async function recordMusicConnection(input: {
  accessToken?: string;
  expiresAt?: number;
  provider: string;
  refreshToken?: string;
  scopes: string[];
  tokenType?: string;
  userId: string;
}) {
  if (input.provider !== "spotify") {
    return;
  }

  await upsertMusicConnection({
    provider: "spotify",
    scopes: input.scopes,
    userId: input.userId,
  });
  await updateStoredProviderTokens({
    accessToken: input.accessToken,
    expiresAt: input.expiresAt,
    provider: "spotify",
    refreshToken: input.refreshToken,
    scope: input.scopes.join(" "),
    tokenType: input.tokenType,
    userId: input.userId,
  });
}

export async function listMusicConnections(userId: string): Promise<MusicConnection[]> {
  const databaseUserId = toDatabaseUserId(userId);
  const sql = `
    select provider, scopes, connected_at, last_synced_at, taste_opt_out_at, disconnected_at
    from public.music_connections
    where user_id = $1
    order by connected_at desc
  `;
  const legacySql = `
    select provider, scopes, connected_at, last_synced_at, null::timestamptz as taste_opt_out_at, disconnected_at
    from public.music_connections
    where user_id = $1
    order by connected_at desc
  `;
  const result = await queryMusicConnections(sql, legacySql, [databaseUserId]);

  return result.rows.map(mapConnectionRow);
}

export async function listMusicProfileItems(userId: string): Promise<MusicProfileItem[]> {
  const databaseUserId = toDatabaseUserId(userId);
  const result = await runWithMissingColumnFallback(
    () =>
      query<MusicProfileItemRow>(
        `
          select
            id, provider, item_type, provider_item_id, name,
            artist_names, genres, external_url, image_url, rank, time_range, synced_at
          from public.music_profile_items
          where user_id = $1
          order by item_type, rank
        `,
        [databaseUserId]
      ),
    () =>
      query<MusicProfileItemRow>(
        `
          select
            id, provider, item_type, provider_item_id, name,
            artist_names, '{}'::text[] as genres, external_url, image_url, rank, time_range, synced_at
          from public.music_profile_items
          where user_id = $1
          order by item_type, rank
        `,
        [databaseUserId]
      )
  );

  return result.rows.map(mapProfileItemRow);
}

export async function disconnectMusicProvider(userId: string, provider: MusicProvider) {
  const databaseUserId = toDatabaseUserId(userId);

  await updateMusicConnectionWithLegacyFallback(
    `
      update public.music_connections
      set disconnected_at = now(),
        taste_opt_out_at = null
      where user_id = $1
        and provider = $2
    `,
    `
      update public.music_connections
      set disconnected_at = now()
      where user_id = $1
        and provider = $2
    `,
    [databaseUserId, provider]
  );
  await clearProviderTokens(databaseUserId, provider);
}

export async function deleteMusicProviderData(userId: string, provider: MusicProvider) {
  const databaseUserId = toDatabaseUserId(userId);

  await updateMusicConnectionWithLegacyFallback(
    `
      update public.music_connections
      set disconnected_at = now(),
        taste_opt_out_at = null
      where user_id = $1
        and provider = $2
    `,
    `
      update public.music_connections
      set disconnected_at = now()
      where user_id = $1
        and provider = $2
    `,
    [databaseUserId, provider]
  );
  await query(
    `
      delete from public.music_profile_items
      where user_id = $1
        and provider = $2
    `,
    [databaseUserId, provider]
  );
  await clearProviderTokens(databaseUserId, provider);
}

export async function setMusicTasteOptOut(userId: string, provider: MusicProvider, optedOut: boolean) {
  await query(
    `
      update public.music_connections
      set taste_opt_out_at = case when $3::boolean then now() else null end
      where user_id = $1
        and provider = $2
    `,
    [toDatabaseUserId(userId), provider, optedOut]
  );
}

export async function syncSpotifyMusicProfile(userId: string) {
  const flags = getAuthFeatureFlags();

  if (!flags.spotify) {
    throw new Error("Spotify auth is not enabled.");
  }

  const account = await getSpotifyAccount(userId);
  const accessToken = await getUsableSpotifyAccessToken(userId, account);
  const [artists, tracks] = await Promise.all([
    fetchSpotifyTopItems<SpotifyTopArtistsResponse>(accessToken, "artists"),
    fetchSpotifyTopItems<SpotifyTopTracksResponse>(accessToken, "tracks"),
  ]);
  const items = [
    ...normalizeArtists(artists),
    ...normalizeTracks(tracks),
  ];

  await replaceSpotifyProfileItems(userId, items);
  await upsertMusicConnection({
    provider: "spotify",
    scopes: splitScopes(account.scope),
    userId,
  });
  await query(
    `
      update public.music_connections
      set last_synced_at = now(),
        disconnected_at = null
      where user_id = $1
        and provider = 'spotify'
    `,
    [toDatabaseUserId(userId)]
  );

  return listMusicProfileItems(userId);
}

export async function searchSpotifyTracks(userId: string, queryText: string) {
  const flags = getAuthFeatureFlags();
  const normalizedQuery = queryText.trim().slice(0, 120);

  if (!flags.spotify) {
    throw new Error("Spotify auth is not enabled.");
  }
  if (normalizedQuery.length < 2) {
    return [];
  }

  const account = await getSpotifyAccount(userId);
  const accessToken = await getUsableSpotifyAccessToken(userId, account);
  const url = new URL("https://api.spotify.com/v1/search");
  url.searchParams.set("q", normalizedQuery);
  url.searchParams.set("type", "track");
  url.searchParams.set("limit", "6");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    await throwSpotifyApiError(response, "Could not search Spotify tracks.");
  }

  const payload = (await response.json()) as SpotifySearchTracksResponse;

  return (payload.tracks?.items ?? []).flatMap((item): SpotifyTrackSearchResult[] => {
    if (!item?.id || !item.name || !item.external_urls?.spotify) {
      return [];
    }

    return [
      {
        albumName: item.album?.name ?? null,
        artistNames: item.artists?.map((artist) => artist.name).filter(isString) ?? [],
        externalUrl: item.external_urls.spotify,
        imageUrl: item.album?.images?.[0]?.url ?? null,
        name: item.name,
        provider: "spotify",
        providerItemId: item.id,
      },
    ];
  });
}

export async function searchSpotifyArtists(userId: string, queryText: string) {
  const flags = getAuthFeatureFlags();
  const normalizedQuery = queryText.trim().slice(0, 120);

  if (!flags.spotify) {
    throw new Error("Spotify auth is not enabled.");
  }
  if (normalizedQuery.length < 2) {
    return [];
  }

  const account = await getSpotifyAccount(userId);
  const accessToken = await getUsableSpotifyAccessToken(userId, account);
  const url = new URL("https://api.spotify.com/v1/search");
  url.searchParams.set("q", normalizedQuery);
  url.searchParams.set("type", "artist");
  url.searchParams.set("limit", "6");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    await throwSpotifyApiError(response, "Could not search Spotify artists.");
  }

  const payload = (await response.json()) as SpotifySearchArtistsResponse;

  return (payload.artists?.items ?? []).flatMap((item): SpotifyArtistSearchResult[] => {
    if (!item?.id || !item.name || !item.external_urls?.spotify) {
      return [];
    }

    return [
      {
        externalUrl: item.external_urls.spotify,
        imageUrl: item.images?.[0]?.url ?? null,
        name: item.name,
        provider: "spotify",
        providerItemId: item.id,
      },
    ];
  });
}

/**
 * Resolve an event artist's own popular tracks from Spotify (PRD 17 / Phase 9 C1).
 * Reads only — searches for the artist, then fetches their top tracks. Uses the existing
 * `user-read-private` scope (`market=from_token`); no new scope. Returns [] when the artist
 * can't be resolved. Throws `SpotifyLimitedBetaAccessError` on a 403 like the other reads.
 */
export async function getSpotifyArtistTopTracks(
  userId: string,
  artistName: string
): Promise<SpotifyArtistTopTrack[]> {
  const flags = getAuthFeatureFlags();

  if (!flags.spotify) {
    throw new Error("Spotify auth is not enabled.");
  }

  const trimmed = artistName.trim();
  if (trimmed.length < 2) {
    return [];
  }

  const account = await getSpotifyAccount(userId);
  const accessToken = await getUsableSpotifyAccessToken(userId, account);

  const matches = await fetchSpotifyArtistMatches(accessToken, trimmed);
  const artist = pickBestArtistMatch(matches, trimmed);
  if (!artist?.id) {
    return [];
  }

  const url = new URL(`https://api.spotify.com/v1/artists/${artist.id}/top-tracks`);
  url.searchParams.set("market", "from_token");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    await throwSpotifyApiError(response, "Could not load Spotify artist tracks.");
  }

  const payload = (await response.json()) as SpotifyArtistTopTracksResponse;

  return (payload.tracks ?? []).flatMap((item): SpotifyArtistTopTrack[] => {
    if (!item?.id || !item.name || !item.external_urls?.spotify) {
      return [];
    }

    return [
      {
        albumName: item.album?.name ?? null,
        artistNames: item.artists?.map((entry) => entry.name).filter(isString) ?? [],
        externalUrl: item.external_urls.spotify,
        imageUrl: item.album?.images?.[0]?.url ?? null,
        name: item.name,
        previewUrl: item.preview_url ?? null,
        provider: "spotify",
        providerItemId: item.id,
      },
    ];
  });
}

async function fetchSpotifyArtistMatches(accessToken: string, queryText: string) {
  const url = new URL("https://api.spotify.com/v1/search");
  url.searchParams.set("q", queryText.slice(0, 120));
  url.searchParams.set("type", "artist");
  url.searchParams.set("limit", "5");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    await throwSpotifyApiError(response, "Could not search Spotify artists.");
  }

  const payload = (await response.json()) as SpotifySearchArtistsResponse;
  return (payload.artists?.items ?? []).filter(
    (item): item is { id: string; name: string } => Boolean(item?.id && item?.name)
  );
}

async function upsertMusicConnection(input: {
  provider: MusicProvider;
  scopes: string[];
  userId: string;
}) {
  await query(
    `
      insert into public.music_connections (
        id,
        user_id,
        provider,
        scopes,
        disconnected_at
      )
      values ($1, $2, $3, $4, null)
      on conflict (user_id, provider)
      do update set
        scopes = excluded.scopes,
        disconnected_at = null
    `,
    [randomUUID(), toDatabaseUserId(input.userId), input.provider, input.scopes]
  );
}

async function updateStoredProviderTokens(input: {
  accessToken?: string;
  expiresAt?: number;
  provider: MusicProvider;
  refreshToken?: string;
  scope?: string;
  tokenType?: string;
  userId: string;
}) {
  if (!input.accessToken) {
    return;
  }

  await query(
    `
      update public.accounts
      set access_token = $3,
        expires_at = $4,
        refresh_token = coalesce($5, refresh_token),
        scope = coalesce($6, scope),
        token_type = coalesce($7, token_type)
      where "userId" = $1
        and provider = $2
    `,
    [
      toDatabaseUserId(input.userId),
      input.provider,
      input.accessToken,
      input.expiresAt ?? null,
      input.refreshToken ?? null,
      input.scope ?? null,
      input.tokenType ?? null,
    ]
  );
}

/**
 * Refresh failed unrecoverably: discard the dead tokens and stamp the connection disconnected so the
 * Health probe's freshness/drift view and the profile UI both reflect "needs reconnect" rather than
 * silently keeping a connection that can no longer sync. Tolerates the pre-`disconnected_at` schema.
 */
async function markSpotifyConnectionNeedsReconnect(userId: string) {
  const databaseUserId = toDatabaseUserId(userId);
  await clearProviderTokens(databaseUserId, "spotify");
  await updateMusicConnectionWithLegacyFallback(
    `
      update public.music_connections
      set disconnected_at = now(),
        taste_opt_out_at = null
      where user_id = $1
        and provider = 'spotify'
    `,
    `
      update public.music_connections
      set disconnected_at = now()
      where user_id = $1
        and provider = 'spotify'
    `,
    [databaseUserId]
  );
}

async function clearProviderTokens(databaseUserId: number, provider: MusicProvider) {
  await query(
    `
      update public.accounts
      set access_token = null,
        refresh_token = null,
        expires_at = null,
        token_type = null,
        scope = null
      where "userId" = $1
        and provider = $2
    `,
    [databaseUserId, provider]
  );
}

async function getSpotifyAccount(userId: string) {
  const result = await query<AccountRow>(
    `
      select access_token, refresh_token, expires_at, scope
      from public.accounts
      where "userId" = $1
        and provider = 'spotify'
      limit 1
    `,
    [toDatabaseUserId(userId)]
  );
  const account = result.rows[0];

  if (!account?.access_token) {
    throw new Error("Spotify is not connected.");
  }

  return account;
}

async function getUsableSpotifyAccessToken(userId: string, account: AccountRow) {
  const expiresAt = Number(account.expires_at ?? 0);
  const shouldRefresh = account.refresh_token && expiresAt > 0 && expiresAt * 1000 < Date.now() + 60_000;

  if (!shouldRefresh) {
    return account.access_token as string;
  }

  return refreshSpotifyAccessToken(userId, account.refresh_token as string);
}

async function refreshSpotifyAccessToken(userId: string, refreshToken: string) {
  const clientId = process.env.AUTH_SPOTIFY_ID;
  const clientSecret = process.env.AUTH_SPOTIFY_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Spotify client credentials are not configured.");
  }

  const response = await fetch("https://accounts.spotify.com/api/token", {
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    method: "POST",
  });

  if (!response.ok) {
    // A dead refresh token (Spotify's 6-month lifetime, revocation, or a rotated app secret) comes
    // back as `invalid_grant`. That is unrecoverable without re-auth, so clear the unusable tokens,
    // mark the connection needing reconnect, and throw a typed error the UI turns into "Reconnect
    // Spotify" — instead of a dead-end generic sync failure that reads as "broken again".
    const errorBody = await response.text().catch(() => "");
    if (isUnrecoverableRefreshResponse(response.status, errorBody)) {
      await markSpotifyConnectionNeedsReconnect(userId).catch(() => {});
      throw new SpotifyReconnectRequiredError();
    }
    throw new Error("Could not refresh Spotify access.");
  }

  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    scope?: string;
  };

  if (!payload.access_token) {
    throw new Error("Spotify did not return an access token.");
  }

  await query(
    `
      update public.accounts
      set access_token = $2,
        expires_at = $3,
        refresh_token = coalesce($4, refresh_token),
        scope = coalesce($5, scope)
      where "userId" = $1
        and provider = 'spotify'
    `,
    [
      toDatabaseUserId(userId),
      payload.access_token,
      Math.floor(Date.now() / 1000) + Number(payload.expires_in ?? 3600),
      payload.refresh_token ?? null,
      payload.scope ?? null,
    ]
  );

  return payload.access_token;
}

async function fetchSpotifyTopItems<ResponseBody>(accessToken: string, type: "artists" | "tracks") {
  const url = new URL(`https://api.spotify.com/v1/me/top/${type}`);
  url.searchParams.set("time_range", SPOTIFY_TIME_RANGE);
  url.searchParams.set("limit", "20");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    await throwSpotifyApiError(response, "Could not sync Spotify taste data.");
  }

  return (await response.json()) as ResponseBody;
}

async function throwSpotifyApiError(response: Response, fallbackMessage: string): Promise<never> {
  if (response.status === 403) {
    await response.text().catch(() => "");
    throw new SpotifyLimitedBetaAccessError();
  }

  throw new Error(fallbackMessage);
}

function normalizeArtists(response: SpotifyTopArtistsResponse) {
  return (response.items ?? []).flatMap((item, index) => {
    if (!item.id || !item.name) {
      return [];
    }

    return [
      {
        artistNames: [],
        // Keep Spotify's per-artist genres (PRD 16 / C5); already returned under user-top-read.
        genres: (item.genres ?? []).filter(isString),
        externalUrl: item.external_urls?.spotify ?? null,
        imageUrl: item.images?.[0]?.url ?? null,
        itemType: "top_artist" as const,
        name: item.name,
        providerItemId: item.id,
        rank: index + 1,
      },
    ];
  });
}

function normalizeTracks(response: SpotifyTopTracksResponse) {
  return (response.items ?? []).flatMap((item, index) => {
    if (!item.id || !item.name) {
      return [];
    }

    return [
      {
        artistNames: item.artists?.map((artist) => artist.name).filter(isString) ?? [],
        genres: [],
        externalUrl: item.external_urls?.spotify ?? null,
        imageUrl: item.album?.images?.[0]?.url ?? null,
        itemType: "top_track" as const,
        name: item.name,
        providerItemId: item.id,
        rank: index + 1,
      },
    ];
  });
}

/**
 * Store artists imported from an uploaded Spotify export (seat-free path) as `top_artist` profile
 * items under the dedicated `import` time_range. Replaces the previous import in full (idempotent
 * re-import), leaving any OAuth-synced `medium_term` rows untouched. Requires no Spotify connection —
 * an email-only listener who was never added to the allowlist can import taste this way.
 */
export async function replaceImportedProfileItems(
  userId: string,
  artists: Array<{ spotifyArtistId: string; name: string; rank: number; genres?: string[] }>
): Promise<MusicProfileItem[]> {
  const databaseUserId = toDatabaseUserId(userId);

  await query(
    `
      delete from public.music_profile_items
      where user_id = $1
        and provider = 'spotify'
        and time_range = $2
    `,
    [databaseUserId, IMPORT_TIME_RANGE]
  );

  await Promise.all(
    artists.map((artist) =>
      runWithMissingColumnFallback(
        () =>
          query(
            `
              insert into public.music_profile_items (
                id, user_id, provider, item_type, provider_item_id, name,
                artist_names, genres, external_url, image_url, rank, time_range
              )
              values ($1, $2, 'spotify', 'top_artist', $3, $4, '{}', $7, null, null, $5, $6)
            `,
            [
              randomUUID(),
              databaseUserId,
              artist.spotifyArtistId,
              artist.name,
              artist.rank,
              IMPORT_TIME_RANGE,
              artist.genres ?? [],
            ]
          ),
        () =>
          query(
            `
              insert into public.music_profile_items (
                id, user_id, provider, item_type, provider_item_id, name,
                artist_names, external_url, image_url, rank, time_range
              )
              values ($1, $2, 'spotify', 'top_artist', $3, $4, '{}', null, null, $5, $6)
            `,
            [randomUUID(), databaseUserId, artist.spotifyArtistId, artist.name, artist.rank, IMPORT_TIME_RANGE]
          )
      )
    )
  );

  return listMusicProfileItems(userId);
}

async function replaceSpotifyProfileItems(
  userId: string,
  items: Array<{
    artistNames: string[];
    genres: string[];
    externalUrl: string | null;
    imageUrl: string | null;
    itemType: MusicProfileItemType;
    name: string;
    providerItemId: string;
    rank: number;
  }>
) {
  const databaseUserId = toDatabaseUserId(userId);

  await query(
    `
      delete from public.music_profile_items
      where user_id = $1
        and provider = 'spotify'
        and time_range = $2
    `,
    [databaseUserId, SPOTIFY_TIME_RANGE]
  );

  await Promise.all(
    items.map((item) => {
      const baseValues = [
        randomUUID(),
        databaseUserId,
        item.itemType,
        item.providerItemId,
        item.name,
        item.artistNames,
      ];
      const tailValues = [item.externalUrl, item.imageUrl, item.rank, SPOTIFY_TIME_RANGE];

      // Persist genres when the column exists; fall back to the pre-C5 shape on older databases
      // that haven't run the migration yet (column defaults to '{}', degrading gracefully).
      return runWithMissingColumnFallback(
        () =>
          query(
            `
              insert into public.music_profile_items (
                id, user_id, provider, item_type, provider_item_id, name,
                artist_names, genres, external_url, image_url, rank, time_range
              )
              values ($1, $2, 'spotify', $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `,
            [...baseValues, item.genres, ...tailValues]
          ),
        () =>
          query(
            `
              insert into public.music_profile_items (
                id, user_id, provider, item_type, provider_item_id, name,
                artist_names, external_url, image_url, rank, time_range
              )
              values ($1, $2, 'spotify', $3, $4, $5, $6, $7, $8, $9, $10)
            `,
            [...baseValues, ...tailValues]
          )
      );
    })
  );
}

function mapConnectionRow(row: MusicConnectionRow): MusicConnection {
  return {
    provider: row.provider,
    scopes: toStringArray(row.scopes),
    connectedAt: toIsoString(row.connected_at),
    lastSyncedAt: row.last_synced_at ? toIsoString(row.last_synced_at) : null,
    tasteOptOutAt: row.taste_opt_out_at ? toIsoString(row.taste_opt_out_at) : null,
    disconnectedAt: row.disconnected_at ? toIsoString(row.disconnected_at) : null,
  };
}

async function queryMusicConnections(sql: string, legacySql: string, values: unknown[]) {
  try {
    return await query<MusicConnectionRow>(sql, values);
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw error;
    }

    return query<MusicConnectionRow>(legacySql, values);
  }
}

/** Run a query, retrying with a fallback if the primary fails due to a not-yet-migrated column. */
async function runWithMissingColumnFallback<T>(primary: () => Promise<T>, fallback: () => Promise<T>) {
  try {
    return await primary();
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw error;
    }
    return fallback();
  }
}

async function updateMusicConnectionWithLegacyFallback(sql: string, legacySql: string, values: unknown[]) {
  try {
    await query(sql, values);
  } catch (error) {
    if (!isMissingColumnError(error)) {
      throw error;
    }

    await query(legacySql, values);
  }
}

function mapProfileItemRow(row: MusicProfileItemRow): MusicProfileItem {
  return {
    id: row.id,
    provider: row.provider,
    itemType: row.item_type,
    providerItemId: row.provider_item_id,
    name: row.name,
    artistNames: toStringArray(row.artist_names),
    genres: toStringArray(row.genres),
    externalUrl: row.external_url,
    imageUrl: row.image_url,
    rank: row.rank,
    timeRange: row.time_range,
    syncedAt: toIsoString(row.synced_at),
  };
}

function toDatabaseUserId(userId: string) {
  const parsed = Number(userId);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("Invalid user id.");
  }

  return parsed;
}

function splitScopes(scope: string | null) {
  return scope?.split(" ").filter(Boolean) ?? [];
}

function toStringArray(value: string[] | string | null) {
  if (Array.isArray(value)) {
    return value;
  }

  return value ? [value] : [];
}

function toIsoString(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function isString(value: string | undefined): value is string {
  return typeof value === "string";
}

function isMissingColumnError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "42703"
  );
}
