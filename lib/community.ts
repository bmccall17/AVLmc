import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type ContributionType = "song" | "comment" | "voice";
export type ContributionStatus = "visible" | "hidden" | "pending";
export type ReactionType = "going" | "fire";

export type Contribution = {
  id: string;
  eventId: string;
  eventTitle: string;
  type: ContributionType;
  displayName: string | null;
  bodyText: string | null;
  songTitle: string | null;
  songArtist: string | null;
  songUrl: string | null;
  audioUrl: string | null;
  durationSeconds: number | null;
  sessionId: string;
  createdAt: string;
  status: ContributionStatus;
};

export type Reaction = {
  id: string;
  eventId: string;
  eventTitle: string;
  type: ReactionType;
  sessionId: string;
  createdAt: string;
};

type CommunityStore = {
  contributions: Contribution[];
  reactions: Reaction[];
};

export type CommunityCounts = {
  songs: number;
  notes: number;
  voices: number;
  going: number;
  fire: number;
};

export type EventCommunity = CommunityCounts & {
  contributions: Contribution[];
};

export type PublicContribution = Omit<Contribution, "sessionId">;

export type PublicEventCommunity = CommunityCounts & {
  contributions: PublicContribution[];
};

const STORE_PATH = path.join(process.cwd(), "data", "community.json");
const MAX_RECENT_CONTRIBUTIONS = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function getCommunityForEvent(eventId: string): Promise<EventCommunity> {
  const store = await readStore();
  const visible = store.contributions.filter(
    (contribution) => contribution.eventId === eventId && contribution.status === "visible"
  );
  const counts = getCountsForEvent(store, eventId);

  return {
    ...counts,
    contributions: visible.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  };
}

export async function getCommunityCountsByEvent(eventIds: string[]) {
  const store = await readStore();
  return Object.fromEntries(eventIds.map((eventId) => [eventId, getCountsForEvent(store, eventId)]));
}

export async function listContributions(status?: ContributionStatus) {
  const store = await readStore();
  return store.contributions
    .filter((contribution) => (status ? contribution.status === status : true))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function createContribution(input: {
  eventId: string;
  eventTitle: string;
  type: ContributionType;
  displayName?: string | null;
  bodyText?: string | null;
  songTitle?: string | null;
  songArtist?: string | null;
  songUrl?: string | null;
  audioUrl?: string | null;
  durationSeconds?: number | null;
  sessionId: string;
}) {
  const store = await readStore();
  assertRateLimit(store, input.sessionId);

  const contribution: Contribution = {
    id: randomUUID(),
    eventId: input.eventId,
    eventTitle: input.eventTitle,
    type: input.type,
    displayName: cleanOptional(input.displayName, 64),
    bodyText: cleanOptional(input.bodyText, 600),
    songTitle: cleanOptional(input.songTitle, 140),
    songArtist: cleanOptional(input.songArtist, 140),
    songUrl: cleanOptional(input.songUrl, 500),
    audioUrl: cleanOptional(input.audioUrl, 500),
    durationSeconds: input.durationSeconds ?? null,
    sessionId: input.sessionId,
    createdAt: new Date().toISOString(),
    status: "visible"
  };

  store.contributions.push(contribution);
  await writeStore(store);
  return contribution;
}

export async function toggleReaction(input: {
  eventId: string;
  eventTitle: string;
  type: ReactionType;
  sessionId: string;
}) {
  const store = await readStore();
  const existing = store.reactions.find(
    (reaction) =>
      reaction.eventId === input.eventId &&
      reaction.type === input.type &&
      reaction.sessionId === input.sessionId
  );

  if (!existing) {
    store.reactions.push({
      id: randomUUID(),
      eventId: input.eventId,
      eventTitle: input.eventTitle,
      type: input.type,
      sessionId: input.sessionId,
      createdAt: new Date().toISOString()
    });
    await writeStore(store);
  }

  return getCountsForEvent(store, input.eventId);
}

export async function setContributionStatus(id: string, status: ContributionStatus) {
  const store = await readStore();
  const contribution = store.contributions.find((item) => item.id === id);

  if (!contribution) {
    return null;
  }

  contribution.status = status;
  await writeStore(store);
  return contribution;
}

export function publicContribution(contribution: Contribution): PublicContribution {
  const { sessionId, ...safe } = contribution;
  void sessionId;
  return safe;
}

function getCountsForEvent(store: CommunityStore, eventId: string): CommunityCounts {
  const visible = store.contributions.filter(
    (contribution) => contribution.eventId === eventId && contribution.status === "visible"
  );

  return {
    songs: visible.filter((contribution) => contribution.type === "song").length,
    notes: visible.filter((contribution) => contribution.type === "comment").length,
    voices: visible.filter((contribution) => contribution.type === "voice").length,
    going: store.reactions.filter(
      (reaction) => reaction.eventId === eventId && reaction.type === "going"
    ).length,
    fire: store.reactions.filter(
      (reaction) => reaction.eventId === eventId && reaction.type === "fire"
    ).length
  };
}

async function readStore(): Promise<CommunityStore> {
  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<CommunityStore>;
    return {
      contributions: (parsed.contributions ?? []).map((contribution) => ({
        ...contribution,
        songArtist: contribution.songArtist ?? null
      })),
      reactions: parsed.reactions ?? []
    };
  } catch {
    return { contributions: [], reactions: [] };
  }
}

async function writeStore(store: CommunityStore) {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
  await writeFile(STORE_PATH, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function assertRateLimit(store: CommunityStore, sessionId: string) {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  const recent = store.contributions.filter(
    (contribution) =>
      contribution.sessionId === sessionId && new Date(contribution.createdAt).getTime() >= cutoff
  );

  if (recent.length >= MAX_RECENT_CONTRIBUTIONS) {
    throw new Error("Please slow down and try again in a few minutes.");
  }
}

function cleanOptional(value: string | null | undefined, maxLength: number) {
  const cleaned = value?.trim();
  if (!cleaned) {
    return null;
  }
  return cleaned.slice(0, maxLength);
}
