import { NextResponse } from "next/server";
import { getAuthFeatureFlags } from "@/lib/auth-flags";
import { requireUserId } from "@/lib/current-user";
import {
  applyForCurator,
  getMyCuratorStatus,
  getSelfServeAvailability,
  CuratorValidationError,
} from "@/lib/curators";
import { SchemaNotProvisionedError } from "@/lib/schema-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Curator self-serve onboarding API (PRD 29 / Phase 13). Signed-in-only listener plane:
 *   GET  → the caller's OWN curator standing + whether self-serve is currently instant.
 *   POST → submit a self-authored persona; promoted instantly under the gate, else `pending`.
 * The acting user id always comes from the session, NEVER the request body — a caller can only
 * apply as / read themselves. Applications are private to the applicant + admin (never public, no
 * pay-to-play). Returns 401 when anonymous. Mirrors app/api/me/follows.
 */
export async function GET() {
  const userId = await getSignedInUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const [myStatus, availability] = await Promise.all([
    getMyCuratorStatus(userId),
    getSelfServeAvailability(),
  ]);

  return NextResponse.json({ myStatus, selfServeOpen: availability.open });
}

export async function POST(request: Request) {
  const userId = await getSignedInUserId();
  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const myStatus = await applyForCurator({
      userId,
      handle: typeof body.handle === "string" ? body.handle : "",
      displayName: typeof body.displayName === "string" ? body.displayName : null,
      bio: typeof body.bio === "string" ? body.bio : null,
      note: typeof body.note === "string" ? body.note : null,
      avatarUrl: typeof body.avatarUrl === "string" ? body.avatarUrl : null,
    });
    return NextResponse.json({ myStatus });
  } catch (error) {
    if (error instanceof CuratorValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof SchemaNotProvisionedError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("Curator application failed:", error);
    return NextResponse.json({ error: "Curator application unavailable." }, { status: 500 });
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
