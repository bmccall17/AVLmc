import { NextResponse } from "next/server";
import { getAuthFeatureFlags } from "@/lib/auth-flags";
import { requireUserId } from "@/lib/current-user";
import { searchSpotifyTracks } from "@/lib/music";
import {
  SPOTIFY_LIMITED_BETA_CODE,
  SPOTIFY_LIMITED_BETA_MESSAGE,
  isSpotifyLimitedBetaAccessError,
} from "@/lib/spotify-limited-access";
import {
  SPOTIFY_RECONNECT_CODE,
  SPOTIFY_RECONNECT_MESSAGE,
  isSpotifyReconnectRequiredError,
} from "@/lib/spotify-reconnect";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const userId = await getSignedInUserId();

  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";

  if (query.length < 2) {
    return NextResponse.json({ tracks: [] });
  }

  try {
    return NextResponse.json({
      tracks: await searchSpotifyTracks(userId, query),
    });
  } catch (error) {
    if (isSpotifyReconnectRequiredError(error)) {
      return NextResponse.json(
        { code: SPOTIFY_RECONNECT_CODE, error: SPOTIFY_RECONNECT_MESSAGE, tracks: [] },
        { status: 409 }
      );
    }

    if (isSpotifyLimitedBetaAccessError(error)) {
      return NextResponse.json(
        {
          code: SPOTIFY_LIMITED_BETA_CODE,
          error: SPOTIFY_LIMITED_BETA_MESSAGE,
          tracks: [],
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not search Spotify tracks." },
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
