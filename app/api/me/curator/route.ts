import { NextResponse } from "next/server";
import { getAuthFeatureFlags } from "@/lib/auth-flags";
import { requireUserId } from "@/lib/current-user";
import {
  addMyPick,
  getMyCurator,
  removeMyPick,
  setMyPickStatus,
  updateMyCuratorPersona,
  CuratorValidationError,
  type CuratorPickStatus,
} from "@/lib/curators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Curator self-management API (PRD 31 / Phase 13). Signed-in-only, SELF-SCOPED: every action
 * resolves the caller's OWN curator row from the session user id and acts only on it — a caller can
 * never read or modify another curator (the curator/pick id is checked against the caller's own row
 * in SQL). Admin moderation still overrides: a non-active row refuses self-management.
 *   GET    → my curator + my picks (incl. hidden, for management).
 *   PATCH  → edit my persona, or (target='pick') show/hide one of my picks.
 *   POST   → add a pick to my curator.
 *   DELETE → remove one of my picks.
 * Returns 401 when anonymous.
 */
export async function GET() {
  const userId = await getSignedInUserId();
  if (!userId) return unauthorized();

  const curator = await getMyCurator(userId);
  if (!curator) {
    return NextResponse.json({ error: "You are not a curator." }, { status: 404 });
  }
  return NextResponse.json({ curator });
}

export async function POST(request: Request) {
  const userId = await getSignedInUserId();
  if (!userId) return unauthorized();

  const body = await readJson(request);
  if (!body) return badRequest("Invalid JSON body.");

  try {
    await addMyPick(userId, {
      eventId: asString(body.eventId),
      eventTitle: typeof body.eventTitle === "string" ? body.eventTitle : undefined,
      note: typeof body.note === "string" ? body.note : null,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  const userId = await getSignedInUserId();
  if (!userId) return unauthorized();

  const body = await readJson(request);
  if (!body) return badRequest("Invalid JSON body.");

  try {
    if (body.target === "pick" && typeof body.id === "string" && typeof body.status === "string") {
      const ok = await setMyPickStatus(userId, body.id, body.status as CuratorPickStatus);
      return ok ? NextResponse.json({ ok }) : notFound();
    }
    const curator = await updateMyCuratorPersona(userId, {
      displayName: typeof body.displayName === "string" ? body.displayName : undefined,
      bio: typeof body.bio === "string" ? body.bio : undefined,
      avatarUrl: typeof body.avatarUrl === "string" ? body.avatarUrl : undefined,
      handle: typeof body.handle === "string" ? body.handle : undefined,
    });
    return NextResponse.json({ curator });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: Request) {
  const userId = await getSignedInUserId();
  if (!userId) return unauthorized();

  const body = await readJson(request);
  if (!body || typeof body.id !== "string") return badRequest("A pick id is required.");

  try {
    const removed = await removeMyPick(userId, body.id);
    return removed ? NextResponse.json({ ok: true }) : notFound();
  } catch (error) {
    return handleError(error);
  }
}

async function getSignedInUserId() {
  if (!getAuthFeatureFlags().auth) return null;
  try {
    return await requireUserId();
  } catch {
    return null;
  }
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  return (await request.json().catch(() => null)) as Record<string, unknown> | null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function unauthorized() {
  return NextResponse.json({ error: "Sign in required." }, { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function notFound() {
  return NextResponse.json({ error: "Pick not found." }, { status: 404 });
}

function handleError(error: unknown) {
  if (error instanceof CuratorValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error("Curator self-management failed:", error);
  return NextResponse.json({ error: "Curator store unavailable." }, { status: 500 });
}
