import { NextResponse } from "next/server";
import { getAuthFeatureFlags } from "@/lib/auth-flags";
import { requireUserId } from "@/lib/current-user";
import { getCircleEventActivity } from "@/lib/social-activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-event "your people" activity for the signed-in viewer (PRD 24 / C2). Signed-in-only; returns
 * empty for anonymous callers. Accepts `?eventId=` (single) or `?eventIds=a,b,c` (board batch).
 * Strictly gated by the C1 follow-edge-AND-opt-in rule; never exposes anyone outside the caller's
 * circle and never appears in any anonymous/public response.
 */
export async function GET(request: Request) {
  const userId = await getSignedInUserId();

  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const eventIds = parseEventIds(url);

  if (eventIds.length === 0) {
    return NextResponse.json({ error: "An eventId or eventIds is required." }, { status: 400 });
  }

  const activity = await getCircleEventActivity(userId, eventIds);
  return NextResponse.json({ activity });
}

function parseEventIds(url: URL): string[] {
  const single = url.searchParams.get("eventId");
  const many = url.searchParams.get("eventIds");
  const raw = [single, ...(many ? many.split(",") : [])];
  return Array.from(new Set(raw.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
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
