import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAuthFeatureFlags } from "@/lib/auth-flags";
import { listMusicConnections } from "@/lib/music";

export const runtime = "nodejs";

export async function GET() {
  const features = getAuthFeatureFlags();
  const session = features.auth ? await auth() : null;
  const userId = session?.user?.id ?? null;

  return NextResponse.json({
    authenticated: Boolean(userId),
    features,
    user: session?.user
      ? {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          image: session.user.image,
        }
      : null,
    musicConnections: userId ? await listMusicConnections(userId) : [],
  });
}
