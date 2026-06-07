import { NextResponse } from "next/server";
import { getAuthFeatureFlags } from "@/lib/auth-flags";
import { requireUserId } from "@/lib/current-user";
import { searchSpotifyArtists } from "@/lib/music";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const userId = await getSignedInUserId();

  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";

  if (query.length < 2) {
    return NextResponse.json({ artists: [] });
  }

  try {
    return NextResponse.json({
      artists: await searchSpotifyArtists(userId, query),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not search Spotify artists." },
      { status: 400 }
    );
  }
}

async function getSignedInUserId() {
  const features = getAuthFeatureFlags();

  if (!features.auth || !features.spotify) {
    return null;
  }

  try {
    return await requireUserId();
  } catch {
    return null;
  }
}
