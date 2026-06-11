import { NextResponse } from "next/server";
import { getAuthFeatureFlags } from "@/lib/auth-flags";
import { requireUserId } from "@/lib/current-user";
import {
  getListenerDiscoveryPreferences,
  saveListenerDiscoveryPreferences,
} from "@/lib/listener-preferences-store";

export const runtime = "nodejs";

export async function GET() {
  const userId = await getSignedInUserId();

  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  return NextResponse.json({
    preferences: await getListenerDiscoveryPreferences(userId),
  });
}

export async function PUT(request: Request) {
  const userId = await getSignedInUserId();

  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const preferences = body?.preferences ?? body;

  try {
    return NextResponse.json({
      preferences: await saveListenerDiscoveryPreferences(userId, preferences),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save listener preferences." },
      { status: 400 }
    );
  }
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
