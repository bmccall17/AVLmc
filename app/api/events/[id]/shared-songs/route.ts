import { NextResponse } from "next/server";
import { getOptionalUserId } from "@/lib/current-user";
import { listPublicSharedSongs } from "@/lib/shared-songs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public, unattributed shared song list for an event (PRD 17). When the requester is signed in,
// their own top tracks badge matching rows ("you already love this one"); anonymous requests
// never receive that overlay, and no row ever carries the seeder's identity.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ error: "Missing event id." }, { status: 400 });
  }

  try {
    const userId = await getOptionalUserId();
    const songs = await listPublicSharedSongs(id, userId);
    return NextResponse.json({ songs });
  } catch (error) {
    console.error("Shared songs lookup failed:", error);
    return NextResponse.json({ songs: [] });
  }
}
