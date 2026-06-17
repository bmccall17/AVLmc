import { NextResponse } from "next/server";
import { getAuthFeatureFlags } from "@/lib/auth-flags";
import { requireUserId } from "@/lib/current-user";
import {
  followUser,
  getFollowerCount,
  listFollowing,
  unfollowUser,
} from "@/lib/social-graph";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Social / Curator Graph API (PRD 23 / C1). Signed-in-only. Returns ONLY the caller's own
 * following list + their aggregate follower count — never another listener's follower identities,
 * and never any follow/sharing data in a public/community/OG response. Mirrors the saved-items API.
 */
export async function GET() {
  const userId = await getSignedInUserId();

  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const [following, followerCount] = await Promise.all([
    listFollowing(userId),
    getFollowerCount(userId),
  ]);

  return NextResponse.json({ following, followerCount });
}

export async function POST(request: Request) {
  const userId = await getSignedInUserId();

  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const followeeUserId = await readFolloweeUserId(request);

  if (!followeeUserId) {
    return NextResponse.json({ error: "A valid followeeUserId is required." }, { status: 400 });
  }

  try {
    await followUser(userId, followeeUserId);
    return NextResponse.json({ following: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not follow this listener." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  const userId = await getSignedInUserId();

  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const followeeUserId = await readFolloweeUserId(request);

  if (!followeeUserId) {
    return NextResponse.json({ error: "A valid followeeUserId is required." }, { status: 400 });
  }

  try {
    const removed = await unfollowUser(userId, followeeUserId);
    return NextResponse.json({ following: false, removed });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not unfollow this listener." },
      { status: 400 }
    );
  }
}

async function readFolloweeUserId(request: Request): Promise<string | null> {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const raw = body?.followeeUserId;

  if (typeof raw === "string" && raw.trim()) {
    return raw.trim();
  }
  if (typeof raw === "number" && Number.isInteger(raw) && raw > 0) {
    return String(raw);
  }
  return null;
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
