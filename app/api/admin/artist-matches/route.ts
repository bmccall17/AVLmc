import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, isAdminSession } from "@/lib/admin";
import { listArtistMatchesForReview, setArtistMatchStatus } from "@/lib/artist-match";
import type { ArtistMatchStatus } from "@/lib/artist-match-core";

/** Admin artist-match review queue (PRD 46, Story D). Admin-gated; mirrors contributions mod. */
export const dynamic = "force-dynamic";

async function requireAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return isAdminSession(cookieStore.get(ADMIN_COOKIE_NAME)?.value);
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  }
  const matches = await listArtistMatchesForReview();
  return NextResponse.json({ matches }, { headers: { "cache-control": "no-store" } });
}

const ALLOWED_STATUSES = new Set<ArtistMatchStatus>(["confirmed", "rejected", "needs_review"]);

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const eventId = typeof body?.eventId === "string" ? body.eventId : "";
  const status = typeof body?.status === "string" ? (body.status as ArtistMatchStatus) : null;

  if (!eventId || !status || !ALLOWED_STATUSES.has(status)) {
    return NextResponse.json({ error: "Missing or invalid fields." }, { status: 400 });
  }

  const updated = await setArtistMatchStatus(eventId, status);
  if (!updated) {
    return NextResponse.json({ error: "Match not found." }, { status: 404 });
  }
  return NextResponse.json({ match: updated });
}
