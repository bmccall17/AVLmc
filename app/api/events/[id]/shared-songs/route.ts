import { NextResponse } from "next/server";
import { getOptionalUserId } from "@/lib/current-user";
import { listPublicSharedSongs } from "@/lib/shared-songs";
import { attributeSharedSongs } from "@/lib/social-activity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public, unattributed shared song list for an event (PRD 17). When the requester is signed in,
// their own top tracks badge matching rows ("you already love this one"), and rows seeded by people
// they follow who opted into sharing gain a "shared by …" attribution (PRD 24 / C2). Anonymous
// requests never receive either overlay, and no row ever carries the raw seeder identity.
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  if (!id) {
    return NextResponse.json({ error: "Missing event id." }, { status: 400 });
  }

  try {
    const userId = await getOptionalUserId();
    const publicSongs = await listPublicSharedSongs(id, userId);
    // Attribution is a no-op for anonymous viewers (returns the songs unchanged).
    const songs = await attributeSharedSongs(userId, id, publicSongs);
    return NextResponse.json({ songs });
  } catch (error) {
    console.error("Shared songs lookup failed:", error);
    return NextResponse.json({ songs: [] });
  }
}
