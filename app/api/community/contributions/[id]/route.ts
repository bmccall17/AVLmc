import { NextResponse } from "next/server";
import { updateContribution } from "@/lib/community";
import { requireUserId } from "@/lib/current-user";
import { revalidateEventSignals } from "@/lib/event-signals-cache";

export const runtime = "nodejs";

export async function PUT(request: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireUserId();
    const { id } = await props.params;

    const body = (await request.json()) as { bodyText?: string | null };

    if (!body.bodyText || body.bodyText.trim() === "") {
      return NextResponse.json({ error: "Text cannot be empty." }, { status: 400 });
    }

    const contribution = await updateContribution(id, userId, {
      bodyText: body.bodyText.trim(),
    });

    if (!contribution) {
      return NextResponse.json(
        { error: "Contribution not found or you do not have permission to edit it." },
        { status: 404 }
      );
    }

    revalidateEventSignals();
    return NextResponse.json({ contribution });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Sign in")) {
      return NextResponse.json({ error: "Sign in required to edit contributions." }, { status: 401 });
    }

    console.error("Error updating contribution:", error);
    return NextResponse.json({ error: "An unexpected error occurred." }, { status: 500 });
  }
}
