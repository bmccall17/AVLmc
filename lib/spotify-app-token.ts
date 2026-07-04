import "server-only";
import {
  isSafeSpotifyArtistId,
  type SpotifyArtistCandidate,
} from "@/lib/artist-match-core";

/**
 * App-only Spotify catalog client (PRD 46, Story A).
 *
 * Uses the Client Credentials flow against the existing AUTH_SPOTIFY_ID / AUTH_SPOTIFY_SECRET to
 * mint an app token — NO user, NO allowlist seat, NO new scopes. This is the unlock the whole
 * feature rests on: Development Mode's 25-user allowlist gates *user authorization*, not app-token
 * catalog reads, so `GET /v1/search?type=artist` and `GET /v1/artists/{id}/top-tracks` work today
 * for every event with zero user involvement.
 *
 * SPIKE GATE (verify on first deploy, PRD Story A / Risks): confirm both endpoints succeed with an
 * app token under Development Mode, and confirm whether `preview_url` is populated for our app
 * (Spotify stopped issuing previews to apps created after Nov 2024). The artist EMBED ships either
 * way; hover-play only ships if previews flow. If app-token catalog reads ever regress, the
 * documented fallback is opportunistic resolution via already-connected users' tokens + manual
 * curation for top venues.
 *
 * Token is cached in module memory with expiry-aware refresh (~1h). Reads retry once on 401
 * (stale token) by force-refreshing. All reads are best-effort from the caller's perspective:
 * network/Spotify failures throw SpotifyAppTokenError, which matchers catch and treat as "no match
 * this pass" rather than failing ingestion.
 */

export class SpotifyAppTokenError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "SpotifyAppTokenError";
    this.status = status;
  }
}

export type SpotifyAppArtistTopTrack = {
  providerItemId: string;
  name: string;
  artistNames: string[];
  albumName: string | null;
  externalUrl: string;
  imageUrl: string | null;
  previewUrl: string | null;
};

type CachedToken = {
  accessToken: string;
  // Epoch ms after which the token must be refreshed (already discounted by a safety margin).
  expiresAtMs: number;
};

type TokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
};

type SearchArtistsResponse = {
  artists?: {
    items?: Array<{
      id?: string;
      name?: string;
      images?: Array<{ url?: string }>;
    } | null>;
  };
};

type ArtistTopTracksResponse = {
  tracks?: Array<{
    id?: string;
    name?: string;
    preview_url?: string | null;
    external_urls?: { spotify?: string };
    album?: { name?: string; images?: Array<{ url?: string }> };
    artists?: Array<{ name?: string }>;
  } | null>;
};

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_BASE = "https://api.spotify.com/v1";
// Refresh a minute early so an in-flight request never rides a token that expires mid-flight.
const TOKEN_SAFETY_MARGIN_MS = 60_000;

// Module-scoped cache. Fluid Compute reuses function instances, so this token is shared across
// concurrent requests on the same instance — exactly what we want (one token, many reads).
let cachedToken: CachedToken | null = null;
// De-dupe concurrent refreshes so a burst of matcher calls mints one token, not N.
let inFlightRefresh: Promise<string> | null = null;

function getClientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.AUTH_SPOTIFY_ID;
  const clientSecret = process.env.AUTH_SPOTIFY_SECRET;
  if (!clientId || !clientSecret) {
    throw new SpotifyAppTokenError("Spotify client credentials are not configured.");
  }
  return { clientId, clientSecret };
}

async function requestAppToken(): Promise<string> {
  const { clientId, clientSecret } = getClientCredentials();

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
  });

  if (!response.ok) {
    throw new SpotifyAppTokenError(
      `Could not mint Spotify app token (${response.status}).`,
      response.status
    );
  }

  const payload = (await response.json()) as TokenResponse;
  if (!payload.access_token) {
    throw new SpotifyAppTokenError("Spotify did not return an app access token.");
  }

  const ttlMs = Math.max(0, Number(payload.expires_in ?? 3600) * 1000 - TOKEN_SAFETY_MARGIN_MS);
  cachedToken = {
    accessToken: payload.access_token,
    expiresAtMs: Date.now() + ttlMs,
  };
  return payload.access_token;
}

/** Return a live app token, refreshing (once, de-duped) when the cache is empty or near expiry. */
async function getAppToken(forceRefresh = false): Promise<string> {
  if (!forceRefresh && cachedToken && cachedToken.expiresAtMs > Date.now()) {
    return cachedToken.accessToken;
  }
  if (forceRefresh) {
    cachedToken = null;
  }
  if (!inFlightRefresh) {
    inFlightRefresh = requestAppToken().finally(() => {
      inFlightRefresh = null;
    });
  }
  return inFlightRefresh;
}

/** Reset the in-memory token cache (test seam / manual invalidation). */
export function resetSpotifyAppTokenCache(): void {
  cachedToken = null;
  inFlightRefresh = null;
}

/**
 * Authenticated app-token GET with a single retry: on 401 (expired/rotated token) we force a
 * refresh and try once more. Other non-OK responses throw with the status so callers can back off
 * on 429/5xx (the backfill's rate-respect path).
 */
async function appApiGet<T>(path: string): Promise<T> {
  let token = await getAppToken();
  let response = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 401) {
    token = await getAppToken(true);
    response = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  if (!response.ok) {
    throw new SpotifyAppTokenError(
      `Spotify catalog read failed (${response.status}).`,
      response.status
    );
  }

  return (await response.json()) as T;
}

/** Search the Spotify catalog for artists matching `artistName` (app token, up to 5 candidates). */
export async function searchSpotifyArtistsApp(
  artistName: string,
  limit = 5
): Promise<SpotifyArtistCandidate[]> {
  const trimmed = artistName.trim().slice(0, 120);
  if (trimmed.length < 2) {
    return [];
  }

  const params = new URLSearchParams({
    q: trimmed,
    type: "artist",
    limit: String(Math.min(Math.max(limit, 1), 10)),
  });
  const payload = await appApiGet<SearchArtistsResponse>(`/search?${params.toString()}`);

  return (payload.artists?.items ?? []).flatMap((item): SpotifyArtistCandidate[] => {
    if (!item?.id || !item.name || !isSafeSpotifyArtistId(item.id)) {
      return [];
    }
    return [{ id: item.id, name: item.name, imageUrl: item.images?.[0]?.url ?? null }];
  });
}

/**
 * The matched artist's top tracks (app token, US market). Powers the hover-play playlist and the
 * track-list fallback. `previewUrl` may be null for every track depending on our app's Spotify
 * preview eligibility (see the spike note) — callers must tolerate that.
 */
export async function getSpotifyArtistTopTracksApp(
  artistId: string,
  market = "US"
): Promise<SpotifyAppArtistTopTrack[]> {
  if (!isSafeSpotifyArtistId(artistId)) {
    throw new SpotifyAppTokenError("Refusing to fetch top tracks for an unsafe artist id.");
  }

  const params = new URLSearchParams({ market });
  const payload = await appApiGet<ArtistTopTracksResponse>(
    `/artists/${encodeURIComponent(artistId)}/top-tracks?${params.toString()}`
  );

  return (payload.tracks ?? []).flatMap((item): SpotifyAppArtistTopTrack[] => {
    if (!item?.id || !item.name || !item.external_urls?.spotify) {
      return [];
    }
    return [
      {
        providerItemId: item.id,
        name: item.name,
        artistNames: (item.artists ?? [])
          .map((artist) => artist?.name)
          .filter((name): name is string => typeof name === "string"),
        albumName: item.album?.name ?? null,
        externalUrl: item.external_urls.spotify,
        imageUrl: item.album?.images?.[0]?.url ?? null,
        previewUrl: item.preview_url ?? null,
      },
    ];
  });
}
