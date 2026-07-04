import { NextResponse } from "next/server";
import { getPlayableArtistTracks } from "@/lib/artist-match";
import { listPublicSharedSongs } from "@/lib/shared-songs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type PlayableTrack = {
  providerTrackId: string;
  name: string;
  artistNames: string[];
  previewUrl: string;
  imageUrl: string | null;
  externalUrl: string | null;
  source: "shared" | "artist";
};

/**
 * Ordered hover-play playlist for one event (PRD 46, Story E): community/shared songs first, then
 * the matched artist's top tracks — 30-second preview MP3s only. Mounted lazily by the board's
 * hover player on first arm (nothing is fetched on initial board paint). Returns only tracks that
 * actually carry a preview URL, so the client never attempts to play a dead `<audio>` src. Degrades
 * to an empty list on any error, which the UI reads as the "open to listen" fallback.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!id) {
    return NextResponse.json({ tracks: [] });
  }

  try {
    const [shared, artist] = await Promise.all([
      listPublicSharedSongs(id),
      getPlayableArtistTracks(id),
    ]);

    const seen = new Set<string>();
    const tracks: PlayableTrack[] = [];

    for (const song of shared) {
      if (!song.previewUrl || seen.has(song.providerTrackId)) {
        continue;
      }
      seen.add(song.providerTrackId);
      tracks.push({
        providerTrackId: song.providerTrackId,
        name: song.name,
        artistNames: song.artistNames,
        previewUrl: song.previewUrl,
        imageUrl: song.imageUrl,
        externalUrl: song.externalUrl,
        source: "shared",
      });
    }

    for (const track of artist) {
      if (!track.previewUrl || seen.has(track.providerTrackId)) {
        continue;
      }
      seen.add(track.providerTrackId);
      tracks.push({
        providerTrackId: track.providerTrackId,
        name: track.name,
        artistNames: track.artistNames,
        previewUrl: track.previewUrl,
        imageUrl: track.imageUrl,
        externalUrl: track.externalUrl,
        source: "artist",
      });
    }

    return NextResponse.json({ tracks });
  } catch (error) {
    console.error("Playable tracks lookup failed:", error);
    return NextResponse.json({ tracks: [] });
  }
}
