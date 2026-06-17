import { NextResponse } from "next/server";
import { getCuratorProfile } from "@/lib/curators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public curator profile (PRD 25 / C3): persona + derived top-list + visible picks for an active
 * curator. Returns 404 for an unknown/hidden curator or an invalid handle. Exposes only the public
 * persona (no private going/firing, no tokens/PII); `userId` is the curator's own id, needed only so
 * a viewer can follow them via the C1 edge.
 */
export async function GET(_request: Request, context: { params: Promise<{ handle: string }> }) {
  const { handle } = await context.params;
  const profile = await getCuratorProfile(handle);

  if (!profile) {
    return NextResponse.json({ error: "Curator not found." }, { status: 404 });
  }

  return NextResponse.json({ profile });
}
