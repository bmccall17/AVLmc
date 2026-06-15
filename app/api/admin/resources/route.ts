import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_COOKIE_NAME, isAdminSession } from "@/lib/admin";
import {
  createResource,
  listResources,
  setResourceStatus,
  updateResource,
  ResourceValidationError,
  type ResourceStatus,
  type ResourceType,
  type ResourceWriteInput,
} from "@/lib/admin/resources";

/**
 * Admin-gated CRUD for the curated partner/resource directory (PRD 08 / C3).
 * All mutations require an admin session and are validated server-side.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireAdmin())) return unauthorized();
  const resources = await listResources(true);
  return NextResponse.json({ resources }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) return unauthorized();
  const body = await readJson(request);
  if (!body) return badRequest("Invalid JSON body.");

  try {
    const resource = await createResource(toWriteInput(body));
    return NextResponse.json({ resource });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: Request) {
  if (!(await requireAdmin())) return unauthorized();
  const body = await readJson(request);
  if (!body) return badRequest("Invalid JSON body.");

  const id = typeof body.id === "string" ? body.id : null;
  if (!id) return badRequest("Resource id is required.");

  try {
    // Lightweight status change (archive / restore) without a full edit payload.
    if (body.statusOnly === true && typeof body.status === "string") {
      const resource = await setResourceStatus(id, body.status as ResourceStatus);
      return resource ? NextResponse.json({ resource }) : notFound();
    }

    const resource = await updateResource(id, toWriteInput(body));
    return resource ? NextResponse.json({ resource }) : notFound();
  } catch (error) {
    return handleError(error);
  }
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

async function requireAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  return isAdminSession(cookieStore.get(ADMIN_COOKIE_NAME)?.value);
}

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  return (await request.json().catch(() => null)) as Record<string, unknown> | null;
}

function toWriteInput(body: Record<string, unknown>): ResourceWriteInput {
  return {
    type: body.type as ResourceType,
    name: typeof body.name === "string" ? body.name : "",
    description: asNullableString(body.description),
    url: asNullableString(body.url),
    status: typeof body.status === "string" ? (body.status as ResourceStatus) : undefined,
    linkedVenueName: asNullableString(body.linkedVenueName),
    linkedSource: asNullableString(body.linkedSource),
    surfacedPublicly: Boolean(body.surfacedPublicly),
    notes: asNullableString(body.notes),
  };
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function unauthorized() {
  return NextResponse.json({ error: "Admin login required." }, { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function notFound() {
  return NextResponse.json({ error: "Resource not found." }, { status: 404 });
}

function handleError(error: unknown) {
  if (error instanceof ResourceValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error("Resource write failed:", error);
  return NextResponse.json({ error: "Resource store unavailable." }, { status: 500 });
}
