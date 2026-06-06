import { NextResponse } from "next/server";
import { getAuthFeatureFlags } from "@/lib/auth-flags";
import { requireUserId } from "@/lib/current-user";
import {
  disconnectMusicProvider,
  listMusicConnections,
  type MusicProvider,
} from "@/lib/music";

export const runtime = "nodejs";

const PROVIDERS = new Set<MusicProvider>(["spotify", "google_youtube", "apple_music"]);

export async function GET() {
  const userId = await getSignedInUserId();

  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  return NextResponse.json({
    features: getAuthFeatureFlags(),
    musicConnections: await listMusicConnections(userId),
  });
}

export async function DELETE(request: Request) {
  const userId = await getSignedInUserId();

  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const provider = typeof body?.provider === "string" ? (body.provider as MusicProvider) : "spotify";

  if (!PROVIDERS.has(provider)) {
    return NextResponse.json({ error: "Unsupported music provider." }, { status: 400 });
  }

  await disconnectMusicProvider(userId, provider);

  return NextResponse.json({
    musicConnections: await listMusicConnections(userId),
  });
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
