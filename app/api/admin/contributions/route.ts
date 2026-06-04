import { NextResponse } from "next/server";
import { ADMIN_COOKIE_NAME, isAdminSession } from "@/lib/admin";
import {
  publicContribution,
  setContributionStatus,
  type ContributionStatus,
} from "@/lib/community";

const STATUSES = new Set<ContributionStatus>(["visible", "hidden", "pending"]);

export async function POST(request: Request) {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${ADMIN_COOKIE_NAME}=`))
    ?.split("=")[1];

  if (!isAdminSession(cookie)) {
    return NextResponse.json({ error: "Admin login required." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const id = typeof body?.id === "string" ? body.id : null;
  const status = typeof body?.status === "string" ? (body.status as ContributionStatus) : null;

  if (!id || !status || !STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid moderation action." }, { status: 400 });
  }

  const contribution = await setContributionStatus(id, status);

  if (!contribution) {
    return NextResponse.json({ error: "Contribution not found." }, { status: 404 });
  }

  return NextResponse.json({ contribution: publicContribution(contribution) });
}
