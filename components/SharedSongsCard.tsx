"use client";

import { useCallback, useEffect, useState } from "react";
import {
  SHARED_SONGS_REFRESH_EVENT,
  isSafeSpotifyTrackId,
  type PublicSharedSong,
} from "@/lib/shared-songs-core";

export type SharedSongSummary = {
  count: number;
  thumbnails: string[];
};

type SharedSongsCardProps = {
  eventId: string;
  initialSummary?: SharedSongSummary;
};

// Compact board-card affordance (PRD 17): shows "N shared songs" and lazily expands into the
// Spotify embeds on click — iframes are never rendered until the listener opens it, so the busy
// board doesn't paint dozens of players. Refreshes its count when this event is shared.
export function SharedSongsCard({ eventId, initialSummary }: SharedSongsCardProps) {
  const [count, setCount] = useState(initialSummary?.count ?? 0);
  const [expanded, setExpanded] = useState(false);
  const [songs, setSongs] = useState<PublicSharedSong[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/shared-songs`);
      if (response.ok) {
        const data = (await response.json()) as { songs?: PublicSharedSong[] };
        const next = data.songs ?? [];
        setSongs(next);
        setCount(next.length);
      }
    } catch {
      // Non-fatal.
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    function onRefresh(event: Event) {
      const detail = (event as CustomEvent<{ eventId?: string }>).detail;
      if (detail?.eventId === eventId) {
        void load();
      }
    }

    window.addEventListener(SHARED_SONGS_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(SHARED_SONGS_REFRESH_EVENT, onRefresh);
  }, [eventId, load]);

  function toggle() {
    const next = !expanded;
    setExpanded(next);
    if (next && songs === null) {
      void load();
    }
  }

  if (count === 0 && !expanded) {
    return null;
  }

  return (
    <div className="card-shared-songs">
      <button
        aria-expanded={expanded}
        className="card-shared-toggle"
        onClick={toggle}
        type="button"
      >
        ♫ {count} shared {count === 1 ? "song" : "songs"}
      </button>
      {expanded ? (
        loading && songs === null ? (
          <p className="card-shared-status">Loading…</p>
        ) : songs && songs.length > 0 ? (
          <ul className="card-shared-list">
            {songs
              .slice(0, 5)
              .filter((song) => isSafeSpotifyTrackId(song.providerTrackId))
              .map((song) => (
                <li key={song.providerTrackId}>
                  <iframe
                    className="card-shared-embed"
                    src={`https://open.spotify.com/embed/track/${encodeURIComponent(song.providerTrackId)}`}
                    width="100%"
                    height={80}
                    style={{ border: 0 }}
                    loading="lazy"
                    title={`${song.name} on Spotify`}
                    allow="encrypted-media; clipboard-write; fullscreen; picture-in-picture"
                  />
                  {song.youAlreadyLove ? (
                    <span className="shared-song-love">♥ you already love this one</span>
                  ) : null}
                </li>
              ))}
          </ul>
        ) : (
          <p className="card-shared-status">No shared songs yet.</p>
        )
      ) : null}
    </div>
  );
}
