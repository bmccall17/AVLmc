"use client";

import { useCallback, useEffect, useState } from "react";
import {
  SHARED_SONGS_REFRESH_EVENT,
  isSafeSpotifyTrackId,
  type PublicSharedSong,
} from "@/lib/shared-songs-core";

type SharedListeningProps = {
  eventId: string;
  eventTitle?: string;
  initialSongs: PublicSharedSong[];
  /** Signed-in viewers get the "Share with your circle" affordance (PRD 24 / C2). */
  isSignedIn?: boolean;
};

// Detail-page "Shared listening" surface (PRD 17): the artist's top tracks as in-page Spotify
// embeds, with an "Open in Spotify" link fallback and a per-viewer "you already love" badge.
// Re-fetches when this event is shared (the listener Goes/Fires), so the list fills in live.
// Signed-in viewers also see in-circle "shared by …" attribution and a "Share with your circle"
// action (PRD 24 / C2); anonymous viewers see neither.
export function SharedListening({ eventId, eventTitle, initialSongs, isSignedIn = false }: SharedListeningProps) {
  const [songs, setSongs] = useState<PublicSharedSong[]>(initialSongs);
  const [shareState, setShareState] = useState<"idle" | "sharing" | "shared">("idle");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/shared-songs`);
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as { songs?: PublicSharedSong[] };
      setSongs(data.songs ?? []);
    } catch {
      // Non-fatal: keep whatever is already shown.
    }
  }, [eventId]);

  useEffect(() => {
    function onRefresh(event: Event) {
      const detail = (event as CustomEvent<{ eventId?: string }>).detail;
      if (!detail?.eventId || detail.eventId === eventId) {
        void refresh();
      }
    }

    window.addEventListener(SHARED_SONGS_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(SHARED_SONGS_REFRESH_EVENT, onRefresh);
  }, [eventId, refresh]);

  async function shareWithCircle() {
    if (!isSignedIn || shareState !== "idle") {
      return;
    }
    setShareState("sharing");
    try {
      const response = await fetch("/api/me/circle-share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, eventTitle, kind: "song_list" }),
      });
      setShareState(response.ok ? "shared" : "idle");
    } catch {
      setShareState("idle");
    }
  }

  if (songs.length === 0) {
    return null;
  }

  return (
    <section className="shared-listening" aria-label="Shared listening">
      <header className="shared-listening-head">
        <h2>Shared listening</h2>
        <p>Tracks people heading to this show are listening to.</p>
        {isSignedIn ? (
          <button
            className="circle-share-button"
            disabled={shareState !== "idle"}
            onClick={() => void shareWithCircle()}
            type="button"
          >
            {shareState === "shared" ? "Shared with your circle ✓" : "Share with your circle"}
          </button>
        ) : null}
      </header>
      <ul className="shared-song-list">
        {songs.map((song) => {
          if (!isSafeSpotifyTrackId(song.providerTrackId)) {
            return null;
          }
          // Derive the link from the validated track id (not the fetched URL) so no tainted
          // value reaches the href — same canonical Spotify track destination.
          const link = `https://open.spotify.com/track/${encodeURIComponent(song.providerTrackId)}`;

          return (
            <li className="shared-song" key={song.providerTrackId}>
              <iframe
                className="shared-song-embed"
                src={`https://open.spotify.com/embed/track/${encodeURIComponent(song.providerTrackId)}`}
                width="100%"
                height={80}
                style={{ border: 0 }}
                loading="lazy"
                title={`${song.name} on Spotify`}
                allow="encrypted-media; clipboard-write; fullscreen; picture-in-picture"
              />
              <div className="shared-song-meta">
                {song.sharedBy ? (
                  <span className="shared-song-by">shared by {song.sharedBy}</span>
                ) : null}
                {song.youAlreadyLove ? (
                  <span className="shared-song-love">♥ you already love this one</span>
                ) : null}
                <a className="shared-song-link" href={link} rel="noreferrer" target="_blank">
                  Open in Spotify ↗
                </a>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
