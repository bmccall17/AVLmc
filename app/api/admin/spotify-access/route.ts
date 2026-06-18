import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, isAdminSession } from "@/lib/admin";
import {
  listSpotifyAccessRequestsForAdmin,
  setSpotifyAccessRequestStatus,
} from "@/lib/spotify-access-requests";

export const dynamic = "force-dynamic";

/**
 * Admin-gated Spotify tester-slot access review (PRD 36 / Phase 15). Surfaces the open request queue
 * with each listener's Spotify email so the admin can add them in the Spotify Developer Dashboard
 * (User Management, ≤25) and then mark the request `slot_added` / `approved` / `rejected`. The slot
 * add itself is an external dashboard action — this only tracks it. Admin-cookie gated; no
 * self-serve, no pay-to-play. Mirrors app/api/admin/curators.
 */
export async function GET() {
  if (!(await requireAdmin())) return unauthorized();
  const requests = await listSpotifyAccessRequestsForAdmin();
  return NextResponse.json({ requests }, { headers: { "cache-control": "no-store" } });
}

export async function PATCH(request: Request) {
  if (!(await requireAdmin())) return unauthorized();
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  const id = typeof body.id === "string" || typeof body.id === "number" ? body.id : null;
  const status = typeof body.status === "string" ? body.status : null;
  if (id === null || !status) {
    return NextResponse.json({ error: "An id and status are required." }, { status: 400 });
  }

  try {
    const ok = await setSpotifyAccessRequestStatus(id, status);
    return ok
      ? NextResponse.json({ ok })
      : NextResponse.json({ error: "Request not found." }, { status: 404 });
  } catch (error) {
    console.error("Spotify access request update failed:", error);
    return NextResponse.json({ error: "Could not update the request." }, { status: 400 });
  }
}

async function requireAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return isAdminSession(cookieStore.get(ADMIN_COOKIE_NAME)?.value);
}

function unauthorized() {
  return NextResponse.json({ error: "Admin login required." }, { status: 401 });
}
