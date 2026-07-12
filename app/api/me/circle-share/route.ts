import { NextResponse } from "next/server";
import { getAuthFeatureFlags } from "@/lib/auth-flags";
import { requireUserId } from "@/lib/current-user";
import { revalidateEventSignals } from "@/lib/event-signals-cache";
import { shareWithCircle, type CircleShareKind } from "@/lib/social-activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Share a show (and its song list) with your circle (PRD 24 / C2). Signed-in-only, idempotent,
 * best-effort: it marks the listener as going on the event — the state their followers read — and
 * performs no Spotify write and no ranking change. Failure-safe: never returns an error to the UI.
 */
export async function POST(request: Request) {
  const userId = await getSignedInUserId();

  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const eventId = typeof body?.eventId === "string" ? body.eventId.trim() : "";

  if (!eventId) {
    return NextResponse.json({ error: "An eventId is required." }, { status: 400 });
  }

  const kind: CircleShareKind = body?.kind === "song_list" ? "song_list" : "show";
  const eventTitle = typeof body?.eventTitle === "string" ? body.eventTitle : undefined;

  const shared = await shareWithCircle({ userId, eventId, eventTitle, kind });
  if (shared) {
    revalidateEventSignals();
  }
  return NextResponse.json({ shared });
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
