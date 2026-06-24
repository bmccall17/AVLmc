import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, isAdminSession } from "@/lib/admin";
import {
  addCuratorPick,
  getSelfServeAvailability,
  listCuratorApplications,
  listCuratorsForAdmin,
  listNotActivatedCurators,
  promoteCurator,
  setCuratorStatus,
  setPickStatus,
  CuratorValidationError,
  type CuratorPickStatus,
  type CuratorStatus,
} from "@/lib/curators";
import { CURATOR_SELF_SERVE_GATE } from "@/lib/curators-core";
import {
  listCuratorRecommendationsForAdmin,
  setCuratorRecommendationStatus,
} from "@/lib/curator-recommendations";

/**
 * Admin-gated curator management (PRD 25 / C3; self-serve review PRD 29). Promote/demote/hide
 * curators, add/hide picks, and review the self-serve `pending` queue (approve → active via
 * PATCH status='active', reject → rejected). No money path can set status (no pay-to-play).
 * Mirrors app/api/admin/resources.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdmin())) return unauthorized();
  const [curators, applications, notActivated, recommendations, availability] = await Promise.all([
    listCuratorsForAdmin(),
    listCuratorApplications(),
    listNotActivatedCurators(),
    listCuratorRecommendationsForAdmin(),
    getSelfServeAvailability(),
  ]);
  return NextResponse.json(
    {
      curators,
      applications,
      notActivated,
      recommendations,
      gate: {
        open: availability.open,
        activeCurators: availability.activeCurators,
        users: availability.users,
        maxCurators: CURATOR_SELF_SERVE_GATE.maxCurators,
        maxUsers: CURATOR_SELF_SERVE_GATE.maxUsers,
      },
    },
    { headers: { "cache-control": "no-store" } }
  );
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) return unauthorized();
  const body = await readJson(request);
  if (!body) return badRequest("Invalid JSON body.");

  try {
    if (body.action === "addPick") {
      await addCuratorPick({
        curatorId: asString(body.curatorId),
        eventId: asString(body.eventId),
        eventTitle: typeof body.eventTitle === "string" ? body.eventTitle : undefined,
        note: typeof body.note === "string" ? body.note : null,
      });
      return NextResponse.json({ ok: true });
    }

    // Default: promote (or update) a curator persona.
    const curator = await promoteCurator({
      userId: Number(body.userId),
      handle: asString(body.handle),
      displayName: typeof body.displayName === "string" ? body.displayName : null,
      bio: typeof body.bio === "string" ? body.bio : null,
    });
    return NextResponse.json({ curator });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  if (!(await requireAdmin())) return unauthorized();
  const body = await readJson(request);
  if (!body) return badRequest("Invalid JSON body.");

  try {
    if (body.target === "pick" && typeof body.id === "string") {
      const ok = await setPickStatus(body.id, body.status as CuratorPickStatus);
      return ok ? NextResponse.json({ ok }) : notFound();
    }
    if (body.target === "recommendation" && typeof body.id === "string") {
      const ok = await setCuratorRecommendationStatus(body.id, asString(body.status));
      return ok ? NextResponse.json({ ok }) : notFound();
    }
    if (typeof body.id === "string" && typeof body.status === "string") {
      const ok = await setCuratorStatus(body.id, body.status as CuratorStatus);
      return ok ? NextResponse.json({ ok }) : notFound();
    }
    return badRequest("An id and status are required.");
  } catch (error) {
    return handleError(error);
  }
}

async function requireAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return isAdminSession(cookieStore.get(ADMIN_COOKIE_NAME)?.value);
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  return (await request.json().catch(() => null)) as Record<string, unknown> | null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function unauthorized() {
  return NextResponse.json({ error: "Admin login required." }, { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function notFound() {
  return NextResponse.json({ error: "Curator not found." }, { status: 404 });
}

function handleError(error: unknown) {
  if (error instanceof CuratorValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error("Curator write failed:", error);
  return NextResponse.json({ error: "Curator store unavailable." }, { status: 500 });
}
