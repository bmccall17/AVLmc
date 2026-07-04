import { NextResponse } from "next/server";
import {
  getOrCreateAnonymousSessionId,
  setAnonymousSessionCookie,
} from "@/lib/anonymous-session";
import { isSafeSpotifyArtistId, normalizeArtistName } from "@/lib/artist-match-core";
import { replaceArtistMatch, setArtistMatchStatus } from "@/lib/artist-match";
import { getOptionalUserId } from "@/lib/current-user";
import { recordSpotifyMatchCorrection } from "@/lib/discovery-memory";
import { getEventById } from "@/lib/events";

export const runtime = "nodejs";

/**
 * Listener correction loop for the artist embed (PRD 46, Story D).
 *
 *  - `flag`   — any signed-in listener marks the match wrong. The shared match flips to
 *               `needs_review` (embed hidden for everyone pending admin review) and an audit row is
 *               written to spotify_event_match_corrections (action `reject`).
 *  - `replace`— a Spotify-connected listener picks the correct artist. The shared match becomes
 *               `replaced` (published for everyone) with cached tracks refreshed, plus a `replace`
 *               audit row.
 *
 * The replacement artist id is base62-validated before it is ever persisted or reaches an embed
 * sink (PRD 17 discipline).
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;
  if (!eventId) {
    return NextResponse.json({ error: "Missing event id." }, { status: 400 });
  }

  const userId = await getOptionalUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const sessionId = getOrCreateAnonymousSessionId(request);
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const action = typeof body?.action === "string" ? body.action : null;

  if (action !== "flag" && action !== "replace") {
    return NextResponse.json({ error: "Unknown correction action." }, { status: 400 });
  }

  const event = await getEventById(eventId);
  if (!event) {
    return NextResponse.json({ error: "Event not found." }, { status: 404 });
  }

  const normalizedTerm = normalizeArtistName(event.artistName) || event.artistName.trim();

  if (action === "flag") {
    await setArtistMatchStatus(eventId, "needs_review");
    await recordSpotifyMatchCorrection({
      action: "reject",
      event,
      matchedTerm: event.artistName,
      normalizedTerm,
      replacementImageUrl: null,
      replacementName: null,
      replacementProviderItemId: null,
      replacementUrl: null,
      sessionId,
      userId,
    });
    const response = NextResponse.json({ ok: true, status: "needs_review" });
    setAnonymousSessionCookie(response, sessionId);
    return response;
  }

  // action === "replace"
  const replacement =
    typeof body?.replacement === "object" && body.replacement !== null
      ? (body.replacement as Record<string, unknown>)
      : null;
  const providerItemId = typeof replacement?.providerItemId === "string" ? replacement.providerItemId : "";
  const replacementName = typeof replacement?.name === "string" ? replacement.name : null;
  const replacementImageUrl = typeof replacement?.imageUrl === "string" ? replacement.imageUrl : null;
  const replacementUrl = typeof replacement?.externalUrl === "string" ? replacement.externalUrl : null;

  if (!providerItemId || !isSafeSpotifyArtistId(providerItemId)) {
    return NextResponse.json({ error: "Invalid replacement artist." }, { status: 400 });
  }

  const updated = await replaceArtistMatch({
    eventId,
    artistName: event.artistName,
    spotifyArtistId: providerItemId,
    spotifyArtistName: replacementName,
    spotifyArtistImageUrl: replacementImageUrl,
  });

  if (!updated) {
    return NextResponse.json({ error: "Could not replace the match." }, { status: 400 });
  }

  await recordSpotifyMatchCorrection({
    action: "replace",
    event,
    matchedTerm: event.artistName,
    normalizedTerm,
    replacementImageUrl,
    replacementName,
    replacementProviderItemId: providerItemId,
    replacementUrl,
    sessionId,
    userId,
  });

  const response = NextResponse.json({ ok: true, status: "replaced" });
  setAnonymousSessionCookie(response, sessionId);
  return response;
}
