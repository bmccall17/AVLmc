import { NextResponse } from "next/server";
import { getAuthFeatureFlags } from "@/lib/auth-flags";
import { requireUserId } from "@/lib/current-user";
import {
  deleteMusicProviderData,
  listMusicProfileItems,
  syncSpotifyMusicProfile,
} from "@/lib/music";
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

export async function GET() {
  const userId = await getSignedInUserId();

  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  return NextResponse.json({
    musicProfile: await listMusicProfileItems(userId),
  });
}

export async function POST(request: Request) {
  const userId = await getSignedInUserId();

  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const provider = typeof body?.provider === "string" ? body.provider : "spotify";

  if (provider !== "spotify") {
    return NextResponse.json({ error: "Only Spotify sync is implemented." }, { status: 400 });
  }

  try {
    return NextResponse.json({
      musicProfile: await syncSpotifyMusicProfile(userId),
    });
  } catch (error) {
    if (isSpotifyReconnectRequiredError(error)) {
      return NextResponse.json(
        {
          code: SPOTIFY_RECONNECT_CODE,
          error: SPOTIFY_RECONNECT_MESSAGE,
        },
        { status: 409 }
      );
    }

    if (isSpotifyLimitedBetaAccessError(error)) {
      return NextResponse.json(
        {
          code: SPOTIFY_LIMITED_BETA_CODE,
          error: SPOTIFY_LIMITED_BETA_MESSAGE,
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not sync music profile." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  const userId = await getSignedInUserId();

  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const provider = typeof body?.provider === "string" ? body.provider : "spotify";

  if (provider !== "spotify") {
    return NextResponse.json({ error: "Only Spotify data deletion is implemented." }, { status: 400 });
  }

  await deleteMusicProviderData(userId, "spotify");

  return NextResponse.json({
    musicProfile: await listMusicProfileItems(userId),
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
