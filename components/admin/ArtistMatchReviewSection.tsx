"use client";

import { useState } from "react";
import { isSafeSpotifyArtistId } from "@/lib/artist-match-core";

export type AdminArtistMatch = {
  id: string;
  eventId: string;
  artistName: string;
  spotifyArtistId: string | null;
  spotifyArtistName: string | null;
  spotifyArtistImageUrl: string | null;
  confidence: "exact" | "fuzzy" | null;
  status: string;
  matchedAt: string;
};

/**
 * Admin review queue for held (fuzzy → needs_review) artist matches (PRD 46, Story D). Confirm
 * publishes the embed for everyone; reject tombstones it. Mirrors the contributions moderation UX.
 */
export function ArtistMatchReviewSection({ matches: initial }: { matches: AdminArtistMatch[] }) {
  const [matches, setMatches] = useState(initial);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function decide(match: AdminArtistMatch, status: "confirmed" | "rejected") {
    setPendingId(match.id);
    try {
      const response = await fetch("/api/admin/artist-matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId: match.eventId, status }),
      });
      if (response.ok) {
        setMatches((current) => current.filter((row) => row.id !== match.id));
      }
    } catch {
      // Leave the row in place so the admin can retry.
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="admin-panel">
      <div className="admin-section-header">
        <h2>Artist match review</h2>
        <p className="admin-meta">
          Fuzzy matches held out of the public embed (a wrong artist is worse than none). Confirm to
          publish for everyone; reject to hide it.
        </p>
      </div>

      {matches.length === 0 ? (
        <section className="empty-state">
          <h3>Queue clear</h3>
          <p>No artist matches are waiting for review.</p>
        </section>
      ) : (
        <ul className="admin-artist-match-list">
          {matches.map((match) => {
            const safeId = match.spotifyArtistId && isSafeSpotifyArtistId(match.spotifyArtistId);
            return (
              <li className="admin-artist-match" key={match.id}>
                <div className="admin-artist-match-main">
                  <div>
                    <strong>{match.artistName}</strong>
                    <span className="admin-meta">
                      → matched {match.spotifyArtistName ?? "(unknown)"}{" "}
                      {match.confidence ? `· ${match.confidence}` : ""}
                    </span>
                  </div>
                </div>
                <div className="admin-artist-match-actions">
                  {safeId ? (
                    <a
                      href={`https://open.spotify.com/artist/${encodeURIComponent(match.spotifyArtistId as string)}`}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Preview ↗
                    </a>
                  ) : null}
                  <a href={`/event/${encodeURIComponent(match.eventId)}`} rel="noreferrer" target="_blank">
                    Event ↗
                  </a>
                  <button
                    disabled={pendingId === match.id}
                    onClick={() => void decide(match, "confirmed")}
                    type="button"
                  >
                    Confirm
                  </button>
                  <button
                    className="admin-artist-match-reject"
                    disabled={pendingId === match.id}
                    onClick={() => void decide(match, "rejected")}
                    type="button"
                  >
                    Reject
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
