import { NextResponse } from "next/server";
import { createContribution, getCommunityForEvent, publicContribution } from "@/lib/community";
import type { ContributionType } from "@/lib/community";
import {
  getOrCreateAnonymousSessionId,
  setAnonymousSessionCookie,
} from "@/lib/anonymous-session";
import { getOptionalUserId } from "@/lib/current-user";

export const runtime = "nodejs";

const TYPES = new Set<ContributionType>(["song", "comment"]);

type ContributionInput = {
  eventId: string | null;
  eventTitle: string | null;
  type: ContributionType | null;
  displayName: string | null;
  bodyText: string | null;
  songTitle: string | null;
  songArtist: string | null;
  songUrl: string | null;
  musicProvider: string | null;
  musicProviderItemId: string | null;
  musicProviderUrl: string | null;
  audioUrl: string | null;
  durationSeconds: number | null;
  sessionId: string | null;
  website: string | null;
};

type ValidContributionInput = ContributionInput & {
  eventId: string;
  eventTitle: string;
  type: ContributionType;
};

export async function POST(request: Request) {
  try {
    const sessionId = getOrCreateAnonymousSessionId(request);
    const userId = await getOptionalUserId();
    const contentType = request.headers.get("content-type") ?? "";
    const input = contentType.includes("multipart/form-data")
      ? await parseMultipart(request)
      : await parseJson(request);

    if (input.website) {
      return NextResponse.json({ error: "Spam check failed." }, { status: 400 });
    }

    validateContribution(input);
    const contribution = await createContribution({
      ...input,
      sessionId,
      userId,
    });
    const community = await getCommunityForEvent(input.eventId);

    const response = NextResponse.json({
      contribution: publicContribution(contribution),
      community: {
        ...community,
        contributions: community.contributions.map(publicContribution)
      }
    });
    setAnonymousSessionCookie(response, sessionId);
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save contribution." },
      { status: 400 }
    );
  }
}

async function parseJson(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  return {
    eventId: getString(body, "eventId"),
    eventTitle: getString(body, "eventTitle"),
    type: getString(body, "type") as ContributionType | null,
    displayName: getString(body, "displayName"),
    bodyText: getString(body, "bodyText"),
    songTitle: getString(body, "songTitle"),
    songArtist: getString(body, "songArtist"),
    songUrl: getString(body, "songUrl"),
    musicProvider: getString(body, "musicProvider"),
    musicProviderItemId: getString(body, "musicProviderItemId"),
    musicProviderUrl: getString(body, "musicProviderUrl"),
    audioUrl: null,
    durationSeconds: null,
    sessionId: getString(body, "sessionId"),
    website: getString(body, "website")
  };
}

async function parseMultipart(request: Request) {
  const form = await request.formData();
  const type = getFormString(form, "type") as ContributionType | null;

  if (type === "voice") {
    throw new Error("Voice memos are deferred for this production release.");
  }

  return {
    eventId: getFormString(form, "eventId"),
    eventTitle: getFormString(form, "eventTitle"),
    type,
    displayName: getFormString(form, "displayName"),
    bodyText: getFormString(form, "bodyText"),
    songTitle: getFormString(form, "songTitle"),
    songArtist: getFormString(form, "songArtist"),
    songUrl: getFormString(form, "songUrl"),
    musicProvider: getFormString(form, "musicProvider"),
    musicProviderItemId: getFormString(form, "musicProviderItemId"),
    musicProviderUrl: getFormString(form, "musicProviderUrl"),
    audioUrl: null,
    durationSeconds: null,
    sessionId: getFormString(form, "sessionId"),
    website: getFormString(form, "website")
  };
}

function validateContribution(input: ContributionInput): asserts input is ValidContributionInput {
  if (!input.eventId || !input.eventTitle || !input.type || !TYPES.has(input.type)) {
    throw new Error("Missing contribution fields.");
  }

  if (input.type === "song") {
    if (!input.songTitle || !input.songUrl) {
      throw new Error("Song title and link are required.");
    }
    assertUrl(input.songUrl);
    if (input.musicProviderUrl) {
      assertUrl(input.musicProviderUrl);
    }
  }

  if (input.type === "comment" && !input.bodyText) {
    throw new Error("A note is required.");
  }

}

function assertUrl(value: string) {
  try {
    new URL(value);
  } catch {
    throw new Error("Please enter a valid music link.");
  }
}

function getString(body: Record<string, unknown>, key: string) {
  const value = body[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getFormString(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
