// Network layer for the Audius preview provider (server-only). Resolves a discovery host from the
// public Audius host registry, searches tracks for an artist name, and hands the raw hits to the pure
// core (lib/audius-core.ts) to score + pick. Every decision and every URL guard lives in the core;
// this file only does I/O and shape-mapping, so the provider stays easy to reason about and the client
// never imports `fetch`-bearing code.
//
// Audius is decentralized: there is no single api host. https://api.audius.co returns a rotating list
// of healthy discovery nodes; we pick one and cache it briefly. Stream URLs point at that same node
// and 302 to a CDN MP3 — no token or key required, which is exactly what makes it worth evaluating as
// a preview source.

import {
  audiusPermalinkUrl,
  audiusStreamPath,
  isSafeAudiusStreamUrl,
  pickBestAudiusTrack,
  type AudiusPreviewResult,
  type AudiusTrackCandidate,
} from "@/lib/audius-core";

const HOST_REGISTRY_URL = "https://api.audius.co";
// Audius asks every client to identify itself with an app_name on each call.
const APP_NAME = process.env.AUDIUS_APP_NAME || "avl-music-companion";
const HOST_TTL_MS = 10 * 60 * 1000; // re-resolve the discovery host every 10 minutes
const REQUEST_TIMEOUT_MS = 6000;

let cachedHost: { host: string; at: number } | null = null;

/** Raw Audius track shape (only the fields we consume). Everything is treated as untrusted. */
type RawAudiusTrack = {
  id?: unknown;
  title?: unknown;
  permalink?: unknown;
  duration?: unknown;
  play_count?: unknown;
  favorite_count?: unknown;
  is_streamable?: unknown;
  user?: { name?: unknown; handle?: unknown } | null;
  artwork?: Record<string, unknown> | null;
};

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Audius request failed (${response.status})`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve a healthy Audius discovery host. Cached for HOST_TTL_MS so a burst of lab lookups doesn't
 * re-hit the registry on every keystroke. Only https hosts from the registry are accepted.
 */
export async function resolveAudiusHost(): Promise<string> {
  const now = Date.now();
  if (cachedHost && now - cachedHost.at < HOST_TTL_MS) {
    return cachedHost.host;
  }
  const payload = (await fetchJson(HOST_REGISTRY_URL)) as { data?: unknown };
  const hosts = Array.isArray(payload?.data) ? payload.data : [];
  for (const candidate of hosts) {
    if (typeof candidate === "string") {
      try {
        const url = new URL(candidate);
        if (url.protocol === "https:") {
          const host = candidate.replace(/\/$/, "");
          cachedHost = { host, at: now };
          return host;
        }
      } catch {
        // skip malformed entries
      }
    }
  }
  throw new Error("No healthy Audius discovery host available.");
}

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** Pick the largest square artwork variant that is a plain https URL, else null. */
function pickArtwork(artwork: Record<string, unknown> | null | undefined): string | null {
  if (!artwork) {
    return null;
  }
  for (const key of ["1000x1000", "480x480", "150x150"]) {
    const value = artwork[key];
    if (typeof value === "string") {
      try {
        if (new URL(value).protocol === "https:") {
          return value;
        }
      } catch {
        // ignore
      }
    }
  }
  return null;
}

function mapTrack(raw: RawAudiusTrack): AudiusTrackCandidate | null {
  const id = typeof raw.id === "string" ? raw.id : null;
  const title = typeof raw.title === "string" ? raw.title : null;
  const artistName = typeof raw.user?.name === "string" ? raw.user.name : null;
  if (!id || !title || !artistName) {
    return null;
  }
  const durationSec = toNumber(raw.duration);
  return {
    id,
    title,
    artistName,
    artistHandle: typeof raw.user?.handle === "string" ? raw.user.handle : null,
    permalink: typeof raw.permalink === "string" ? raw.permalink : null,
    playCount: toNumber(raw.play_count),
    favoriteCount: toNumber(raw.favorite_count),
    // Absent `is_streamable` is treated as streamable (Audius omits it for public tracks).
    isStreamable: raw.is_streamable !== false,
    durationSec: durationSec > 0 ? durationSec : null,
    artworkUrl: pickArtwork(raw.artwork),
  };
}

function buildStreamUrl(host: string, trackId: string): string | null {
  const url = `${host}${audiusStreamPath(trackId)}?app_name=${encodeURIComponent(APP_NAME)}`;
  return isSafeAudiusStreamUrl(url) ? url : null;
}

/**
 * Search Audius for `artistName` and resolve a playable preview. This is the provider's single public
 * entry point — the API route and any future live-page wiring call exactly this. Never throws: any
 * failure collapses into `{ status: "error" }` with a message safe to show in the lab.
 */
export async function resolveAudiusPreview(artistName: string): Promise<AudiusPreviewResult> {
  const query = artistName.trim();
  if (!query) {
    return { status: "no_match", query: "", candidatesConsidered: 0 };
  }

  try {
    const host = await resolveAudiusHost();
    const searchUrl =
      `${host}/v1/tracks/search?query=${encodeURIComponent(query)}` +
      `&app_name=${encodeURIComponent(APP_NAME)}&limit=15`;
    const payload = (await fetchJson(searchUrl)) as { data?: unknown };
    const rawTracks = Array.isArray(payload?.data) ? (payload.data as RawAudiusTrack[]) : [];

    const candidates = rawTracks
      .map(mapTrack)
      .filter((track): track is AudiusTrackCandidate => track !== null);

    const match = pickBestAudiusTrack(query, candidates);
    if (!match) {
      return { status: "no_match", query, candidatesConsidered: candidates.length };
    }

    const streamUrl = buildStreamUrl(host, match.track.id);
    if (!streamUrl) {
      // Matched an artist but the stream URL failed its guard — treat as no playable preview.
      return { status: "no_match", query, candidatesConsidered: candidates.length };
    }

    return {
      status: "ok",
      query,
      match,
      streamUrl,
      sourceUrl: audiusPermalinkUrl(match.track.permalink),
      host,
      candidatesConsidered: candidates.length,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "Audius timed out."
        : error instanceof Error
          ? error.message
          : "Audius lookup failed.";
    return { status: "error", query, message };
  }
}
