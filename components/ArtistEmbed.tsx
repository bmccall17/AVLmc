"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isSafeSpotifyArtistId } from "@/lib/artist-match-core";

type ArtistSearchResult = {
  externalUrl: string;
  imageUrl: string | null;
  name: string;
  provider: "spotify";
  providerItemId: string;
};

type ArtistEmbedProps = {
  eventId: string;
  artistName: string;
  /** The resolved Spotify artist id (already base62-validated server-side; re-validated here). */
  spotifyArtistId: string;
  spotifyArtistName: string | null;
  isSignedIn: boolean;
  /** Spotify-connected listeners can search-and-replace; others can only flag. */
  spotifyConnected: boolean;
};

/**
 * Always-on artist "floor" for the event page (PRD 46, Story C/D). Renders Spotify's artist
 * mini-player for the matched artist — anonymous-visible, zero engagement required. This is a
 * client island but it is server-rendered to HTML on first paint, so anonymous visitors get the
 * iframe with no interaction. The iframe `src` is built AT THE SINK from a base62-validated id
 * (PRD 17 discipline), so no tainted value ever reaches the URL.
 *
 * Signed-in listeners get a quiet "Not the right artist?" control: any listener can flag the match
 * (→ needs_review; the embed hides pending review), and a Spotify-connected listener can search for
 * the correct artist and replace it for everyone. Corrections leave a spotify_event_match_corrections
 * audit row server-side.
 */
export function ArtistEmbed({
  eventId,
  artistName,
  spotifyArtistId,
  spotifyArtistName,
  isSignedIn,
  spotifyConnected,
}: ArtistEmbedProps) {
  const [hidden, setHidden] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [replacementArtistId, setReplacementArtistId] = useState(spotifyArtistId);
  const [replacementArtistName, setReplacementArtistName] = useState(spotifyArtistName);

  // Sink guard: never render an iframe for an id that isn't strictly base62.
  if (!isSafeSpotifyArtistId(replacementArtistId) || hidden) {
    return null;
  }

  const displayName = replacementArtistName ?? artistName;
  const src = `https://open.spotify.com/embed/artist/${encodeURIComponent(replacementArtistId)}?utm_source=generator`;

  async function flagWrongArtist() {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/artist-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "flag" }),
      });
      if (response.ok) {
        setHidden(true);
      } else {
        setNotice("Could not flag this match. Please try again.");
      }
    } catch {
      setNotice("Could not flag this match. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function replaceArtist(result: ArtistSearchResult) {
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/artist-match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "replace",
          replacement: {
            providerItemId: result.providerItemId,
            name: result.name,
            imageUrl: result.imageUrl,
            externalUrl: result.externalUrl,
          },
        }),
      });
      if (response.ok) {
        // Swap the embed to the corrected artist in place — no reload needed.
        setReplacementArtistId(result.providerItemId);
        setReplacementArtistName(result.name);
        setPanelOpen(false);
        setNotice(`Fixed — now showing ${result.name} for everyone.`);
      } else {
        setNotice("Could not replace this match. Please try again.");
      }
    } catch {
      setNotice("Could not replace this match. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="artist-embed" aria-label={`${displayName} on Spotify`}>
      <header className="artist-embed-head">
        <h2>Listen to {displayName}</h2>
        <p>The artist&apos;s Spotify — press play, no account needed.</p>
      </header>
      <iframe
        className="artist-embed-frame"
        src={src}
        width="100%"
        height={352}
        style={{ border: 0 }}
        loading="lazy"
        title={`${displayName} on Spotify`}
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
      />
      {isSignedIn ? (
        <div className="artist-embed-correction">
          {!panelOpen ? (
            <button
              className="artist-embed-flag-toggle"
              onClick={() => setPanelOpen(true)}
              type="button"
            >
              Not the right artist?
            </button>
          ) : (
            <div className="artist-embed-correction-panel">
              <button
                className="artist-embed-flag"
                disabled={busy}
                onClick={() => void flagWrongArtist()}
                type="button"
              >
                Flag as wrong &amp; hide
              </button>
              {spotifyConnected ? (
                <ArtistReplaceSearch busy={busy} onPick={(result) => void replaceArtist(result)} />
              ) : (
                <p className="artist-embed-correction-note">
                  Connect Spotify to pick the right artist yourself, or flag it and we&apos;ll review.
                </p>
              )}
              <button
                className="artist-embed-cancel"
                onClick={() => setPanelOpen(false)}
                type="button"
              >
                Cancel
              </button>
            </div>
          )}
          {notice ? <p className="artist-embed-notice">{notice}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function ArtistReplaceSearch({
  busy,
  onPick,
}: {
  busy: boolean;
  onPick: (result: ArtistSearchResult) => void;
}) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<ArtistSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<number | null>(null);

  const search = useCallback(async (value: string) => {
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const response = await fetch(`/api/me/spotify-artists?q=${encodeURIComponent(value.trim())}`);
      if (response.ok) {
        const data = (await response.json()) as { artists?: ArtistSearchResult[] };
        setResults(data.artists ?? []);
      } else {
        setResults([]);
      }
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timer.current) {
        window.clearTimeout(timer.current);
      }
    };
  }, []);

  function onChange(value: string) {
    setTerm(value);
    if (timer.current) {
      window.clearTimeout(timer.current);
    }
    timer.current = window.setTimeout(() => void search(value), 300);
  }

  return (
    <div className="artist-embed-search">
      <label className="artist-embed-search-label">
        <span>Search for the right artist</span>
        <input
          aria-label="Search Spotify artists"
          onChange={(event) => onChange(event.target.value)}
          placeholder="Artist name"
          type="search"
          value={term}
        />
      </label>
      {searching ? <p className="artist-embed-search-status">Searching…</p> : null}
      {results.length > 0 ? (
        <ul className="artist-embed-search-results">
          {results.map((result) => (
            <li key={result.providerItemId}>
              <button
                className="artist-embed-search-pick"
                disabled={busy}
                onClick={() => onPick(result)}
                type="button"
              >
                {result.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" height={32} src={result.imageUrl} width={32} />
                ) : null}
                <span>{result.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
