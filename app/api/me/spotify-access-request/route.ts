import { NextResponse } from "next/server";
import { getAuthFeatureFlags } from "@/lib/auth-flags";
import { requireUserId } from "@/lib/current-user";
import {
  getMySpotifyAccessRequest,
  submitMySpotifyAccessRequest,
} from "@/lib/spotify-access-requests";
import { SpotifyAccessRequestValidationError } from "@/lib/spotify-access-requests-core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Spotify tester-slot access request API (PRD 36 / Phase 15). Signed-in-only listener plane:
 *   GET  → the caller's OWN current request status (or null if they've never asked).
 *   POST → submit/refresh their request with the email on their Spotify account; lands `pending`.
 * Exactly one open request per user (a retry edits the open row). The acting user id always comes
 * from the session, NEVER the body; the Spotify email is private to the listener + admin. Returns
 * 401 when anonymous. Mirrors app/api/me/curator-application.
 */
export async function GET() {
  const userId = await getSignedInUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const request = await getMySpotifyAccessRequest(userId);
  return NextResponse.json({ request }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  const userId = await getSignedInUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const result = await submitMySpotifyAccessRequest({
      userId,
      spotifyEmail: typeof body.spotifyEmail === "string" ? body.spotifyEmail : "",
    });
    return NextResponse.json({ request: result });
  } catch (error) {
    if (error instanceof SpotifyAccessRequestValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Spotify access request failed:", error);
    return NextResponse.json({ error: "Could not submit your request." }, { status: 500 });
  }
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
