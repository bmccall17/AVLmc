import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createContribution, getCommunityForEvent, publicContribution } from "@/lib/community";
import type { ContributionType } from "@/lib/community";

export const runtime = "nodejs";

const TYPES = new Set<ContributionType>(["song", "comment", "voice"]);
const MAX_AUDIO_BYTES = 3 * 1024 * 1024;

type ContributionInput = {
  eventId: string | null;
  eventTitle: string | null;
  type: ContributionType | null;
  displayName: string | null;
  bodyText: string | null;
  songTitle: string | null;
  songArtist: string | null;
  songUrl: string | null;
  audioUrl: string | null;
  durationSeconds: number | null;
  sessionId: string | null;
  website: string | null;
};

type ValidContributionInput = ContributionInput & {
  eventId: string;
  eventTitle: string;
  type: ContributionType;
  sessionId: string;
};

export async function POST(request: Request) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    const input = contentType.includes("multipart/form-data")
      ? await parseMultipart(request)
      : await parseJson(request);

    if (input.website) {
      return NextResponse.json({ error: "Spam check failed." }, { status: 400 });
    }

    validateContribution(input);
    const contribution = await createContribution(input);
    const community = await getCommunityForEvent(input.eventId);

    return NextResponse.json({
      contribution: publicContribution(contribution),
      community: {
        ...community,
        contributions: community.contributions.map(publicContribution)
      }
    });
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
    audioUrl: null,
    durationSeconds: null,
    sessionId: getString(body, "sessionId"),
    website: getString(body, "website")
  };
}

async function parseMultipart(request: Request) {
  const form = await request.formData();
  const type = getFormString(form, "type") as ContributionType | null;
  let audioUrl: string | null = null;

  if (type === "voice") {
    const file = form.get("audio");
    if (!isAudioUpload(file)) {
      throw new Error("Voice memo audio is required.");
    }
    if (!file.type.startsWith("audio/")) {
      throw new Error("Voice memo must be an audio file.");
    }
    if (file.size > MAX_AUDIO_BYTES) {
      throw new Error("Voice memo must be 3 MB or smaller.");
    }

    const extension = audioExtension(file.type);
    const fileName = `${randomUUID()}.${extension}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "voice");
    await mkdir(uploadDir, { recursive: true });
    await writeFile(path.join(uploadDir, fileName), Buffer.from(await file.arrayBuffer()));
    audioUrl = `/uploads/voice/${fileName}`;
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
    audioUrl,
    durationSeconds: Number(getFormString(form, "durationSeconds")) || null,
    sessionId: getFormString(form, "sessionId"),
    website: getFormString(form, "website")
  };
}

function validateContribution(input: ContributionInput): asserts input is ValidContributionInput {
  if (!input.eventId || !input.eventTitle || !input.sessionId || !input.type || !TYPES.has(input.type)) {
    throw new Error("Missing contribution fields.");
  }

  if (input.type === "song") {
    if (!input.songTitle || !input.songUrl) {
      throw new Error("Song title and link are required.");
    }
    assertUrl(input.songUrl);
  }

  if (input.type === "comment" && !input.bodyText) {
    throw new Error("A note is required.");
  }

  if (input.type === "voice") {
    if (!input.audioUrl) {
      throw new Error("Voice memo audio is required.");
    }
    if (input.durationSeconds && input.durationSeconds > 60) {
      throw new Error("Voice memo must be 60 seconds or shorter.");
    }
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

function isAudioUpload(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Blob).arrayBuffer === "function" &&
    typeof (value as Blob).type === "string" &&
    typeof (value as Blob).size === "number"
  );
}

function audioExtension(type: string) {
  if (type.includes("webm")) return "webm";
  if (type.includes("ogg")) return "ogg";
  if (type.includes("mpeg")) return "mp3";
  if (type.includes("wav")) return "wav";
  return "audio";
}
