import { NextResponse } from "next/server";
import { getAuthFeatureFlags } from "@/lib/auth-flags";
import { requireUserId } from "@/lib/current-user";
import {
  isSavedItemType,
  listSavedItems,
  removeSavedItem,
  saveItem,
} from "@/lib/saved-items";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getSignedInUserId();

  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  return NextResponse.json({ saved: await listSavedItems(userId) });
}

export async function POST(request: Request) {
  const userId = await getSignedInUserId();

  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (!body || !isSavedItemType(body.itemType)) {
    return NextResponse.json({ error: "A valid itemType is required." }, { status: 400 });
  }

  try {
    const saved = await saveItem(userId, {
      itemType: body.itemType,
      itemKey: typeof body.itemKey === "string" ? body.itemKey : "",
      label: typeof body.label === "string" ? body.label : "",
      eventId: typeof body.eventId === "string" ? body.eventId : null,
    });

    return NextResponse.json({ saved });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save this item." },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  const userId = await getSignedInUserId();

  if (!userId) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (!body || !isSavedItemType(body.itemType)) {
    return NextResponse.json({ error: "A valid itemType is required." }, { status: 400 });
  }

  try {
    const removed = await removeSavedItem(userId, {
      itemType: body.itemType,
      itemKey: typeof body.itemKey === "string" ? body.itemKey : "",
    });

    return NextResponse.json({ removed });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not remove this item." },
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
