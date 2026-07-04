import { NextResponse } from "next/server";
import { getAuthFeatureFlags } from "@/lib/auth-flags";
import { requireUserId } from "@/lib/current-user";
import { replaceImportedProfileItems } from "@/lib/music";
import { parseExportedArtists } from "@/lib/taste-import-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A generous ceiling for an exported playlist CSV (thousands of tracks are still well under this).
const MAX_CSV_BYTES = 5_000_000;

/**
 * Seat-free taste import (PRD 46 follow-on). A signed-in listener uploads a playlist export CSV
 * (Exportify et al.); we parse the artists off the file and store them as `top_artist` profile items
 * that feed discovery's `artistAffinity` — exactly like the OAuth /me/top sync, but with NO Spotify
 * API call and NO Development-Mode allowlist seat. Works for email-only accounts never allowlisted.
 */
export async function POST(request: Request) {
  const userId = await getSignedInUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const csvText = await request.text();
  if (!csvText.trim()) {
    return NextResponse.json({ error: "Upload a playlist export CSV to import." }, { status: 400 });
  }
  if (csvText.length > MAX_CSV_BYTES) {
    return NextResponse.json({ error: "That file is too large to import." }, { status: 413 });
  }

  const { artists, trackRows, recognized } = parseExportedArtists(csvText);

  if (!recognized) {
    return NextResponse.json(
      {
        error:
          "Couldn't find an artist column in that file. Export your playlists as CSV from Exportify (exportify.net) and upload that file.",
      },
      { status: 422 }
    );
  }
  if (artists.length === 0) {
    return NextResponse.json(
      { error: "That export had no artists to import." },
      { status: 422 }
    );
  }

  const profileItems = await replaceImportedProfileItems(userId, artists);

  return NextResponse.json({
    imported: artists.length,
    trackRows,
    preview: artists.slice(0, 12).map((artist) => artist.name),
    profileItems,
  });
}

async function getSignedInUserId() {
  if (!getAuthFeatureFlags().auth) {
    return null;
  }
  try {
    return await requireUserId();
  } catch {
    return null;
  }
}
