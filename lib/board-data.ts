import { unstable_cache } from "next/cache";
import { getArtistTrackCountsByEvent, getPublishedArtistMatch } from "@/lib/artist-match";
import { getCommunityCountsByEvent, getCommunityForEvent } from "@/lib/community";
import { getCuratedByForEvents } from "@/lib/curators";
import {
  EVENTS_CACHE_TAG,
  EVENT_SIGNALS_CACHE_TAG,
  EVENT_SIGNALS_REVALIDATE_SECONDS,
} from "@/lib/event-read-cache";
import { getSharedSongSummariesByEvent, listPublicSharedSongs } from "@/lib/shared-songs";

/**
 * Cached public per-event payloads (PRD 51 / ADR 002 §6). These maps are identical for every
 * viewer (anonymous and signed-in), so the board's per-view fan-out collapses to one shared cache
 * entry. Write routes revalidate `event-signals` after a successful community/curator/shared-song
 * write, so counts move on the write itself; the hourly revalidate is only a backstop. Viewer-
 * scoped payloads (discovery states, saved keys, circle activity…) stay per-request — they
 * short-circuit to empty without a session identity, so a cookieless view costs zero DB queries.
 */

const readBoardSignalsCached = unstable_cache(
  async (eventIds: string[]) => {
    const [counts, sharedSongSummaries, curatedByEvent, artistTrackCounts] = await Promise.all([
      getCommunityCountsByEvent(eventIds),
      getSharedSongSummariesByEvent(eventIds),
      getCuratedByForEvents(eventIds),
      getArtistTrackCountsByEvent(eventIds),
    ]);

    return { counts, sharedSongSummaries, curatedByEvent, artistTrackCounts };
  },
  ["board-public-signals"],
  { revalidate: EVENT_SIGNALS_REVALIDATE_SECONDS, tags: [EVENTS_CACHE_TAG, EVENT_SIGNALS_CACHE_TAG] }
);

export function getPublicBoardSignals(eventIds: string[]) {
  return readBoardSignalsCached(eventIds);
}

const readEventContextCached = unstable_cache(
  async (eventId: string) => {
    const [community, sharedSongs, curatedByEvent, artistMatch] = await Promise.all([
      // Raw anonymous-visible community payload; the page still applies the per-viewer
      // `publicContribution` mapping after the cached read.
      getCommunityForEvent(eventId),
      // Viewer-independent shape (no per-viewer badge matching without a user id).
      listPublicSharedSongs(eventId, null),
      getCuratedByForEvents([eventId]),
      getPublishedArtistMatch(eventId),
    ]);

    return { community, sharedSongs, curatedBy: curatedByEvent[eventId] ?? [], artistMatch };
  },
  ["event-public-context"],
  { revalidate: EVENT_SIGNALS_REVALIDATE_SECONDS, tags: [EVENTS_CACHE_TAG, EVENT_SIGNALS_CACHE_TAG] }
);

export function getPublicEventContext(eventId: string) {
  return readEventContextCached(eventId);
}
