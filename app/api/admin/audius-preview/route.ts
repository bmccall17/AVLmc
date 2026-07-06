import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, isAdminSession } from "@/lib/admin";
import { resolveAudiusPreview } from "@/lib/audius";

/**
 * Admin-only Audius preview lookup for the Card FX Lab. GET `?artist=<name>` searches Audius, picks a
 * likely-matching streamable track, and returns an `AudiusPreviewResult` (ok / no_match / error). This
 * is the evaluation surface for whether Audius is a viable preview provider before any live wiring, so
 * it's gated to admins exactly like the artist-match review queue.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return isAdminSession(cookieStore.get(ADMIN_COOKIE_NAME)?.value);
}

export async function GET(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  }

  const artist = new URL(request.url).searchParams.get("artist")?.trim() ?? "";
  if (!artist) {
    return NextResponse.json(
      { status: "error", query: "", message: "Provide an ?artist= name to search." },
      { status: 400, headers: { "cache-control": "no-store" } }
    );
  }

  const result = await resolveAudiusPreview(artist);
  return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
}
