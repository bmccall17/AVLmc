import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { UserCircle } from "lucide-react";
import {
  SandboxDiscoveryExperience,
  type SandboxEvent,
} from "@/app/sandbox/discovery-actions/SandboxDiscoveryExperience";
import {
  ANONYMOUS_SESSION_COOKIE_NAME,
  getAnonymousSessionIdFromCookieValue,
} from "@/lib/anonymous-session";
import { getCommunityCountsByEvent, type CommunityCounts } from "@/lib/community";
import { getOptionalUserId } from "@/lib/current-user";
import { scoreDiscoveryEvents, type DiscoveryScore } from "@/lib/discovery";
import {
  listDiscoveryPreferenceSignals,
  listDiscoveryStates,
  listSpotifyMatchCorrections,
} from "@/lib/discovery-memory";
import { getUpcomingEvents, type EventRecord } from "@/lib/events";
import { listMusicConnections, listMusicProfileItems } from "@/lib/music";

export const metadata: Metadata = {
  title: "Discovery Action Sandbox",
  robots: {
    follow: false,
    index: false,
  },
};

export default async function DiscoveryActionSandboxPage() {
  const allEvents = await getUpcomingEvents();
  const events = allEvents.slice(0, 9);
  const eventIds = events.map((event) => event.id);
  const cookieStore = await cookies();
  const sessionId = getAnonymousSessionIdFromCookieValue(
    cookieStore.get(ANONYMOUS_SESSION_COOKIE_NAME)?.value
  );
  const userId = await getOptionalUserId();
  const [
    counts,
    musicConnections,
    musicProfileItems,
    discoveryStates,
    preferenceSignals,
    spotifyMatchCorrections,
  ] = await Promise.all([
    getCommunityCountsByEvent(eventIds),
    userId ? listMusicConnections(userId) : Promise.resolve([]),
    userId ? listMusicProfileItems(userId) : Promise.resolve([]),
    listDiscoveryStates(eventIds, { sessionId, userId }),
    listDiscoveryPreferenceSignals({ sessionId, userId }),
    listSpotifyMatchCorrections(eventIds, { sessionId, userId }),
  ]);
  const scores = scoreDiscoveryEvents({
    connections: musicConnections,
    counts,
    events,
    preferenceSignals,
    profileItems: musicProfileItems,
    spotifyMatchCorrections,
  });
  const cards = events.map((event, index) =>
    buildSandboxEvent({
      counts: counts[event.id],
      event,
      index,
      score: scores[event.id],
      fireSelected: Boolean(discoveryStates[event.id]?.fire),
      goingSelected: Boolean(discoveryStates[event.id]?.planning),
    })
  );
  const profileLabel = userId ? `Listener ${userId}` : "Guest listener";
  const profileDetail =
    musicProfileItems.length > 0
      ? `${musicProfileItems.length} taste signals`
      : `${cards.length} live picks`;

  return (
    <main className="sandbox-shell">
      <header className="sandbox-topbar">
        <Link className="sandbox-brand" href="/">
          <span>AVLmc</span>
          <strong>Asheville Music Connection</strong>
        </Link>
        <nav className="sandbox-tabs" aria-label="Sandbox sections">
          <a href="#discover" aria-current="page">Discover</a>
          <a href="#beats">Beats</a>
          <a href="#cards">Cards</a>
        </nav>
        <button className="sandbox-profile" type="button">
          <UserCircle aria-hidden="true" size={22} strokeWidth={2.2} />
          <span>
            <strong>{profileLabel}</strong>
            <small>{profileDetail}</small>
          </span>
        </button>
      </header>

      <SandboxDiscoveryExperience events={cards} />
    </main>
  );
}

function buildSandboxEvent({
  counts,
  event,
  fireSelected,
  goingSelected,
  index,
  score,
}: {
  counts: CommunityCounts | undefined;
  event: EventRecord;
  fireSelected: boolean;
  goingSelected: boolean;
  index: number;
  score: DiscoveryScore | undefined;
}): SandboxEvent {
  const tag = getPrimaryTag(event);
  const initials = getInitials(event.artistName || event.eventTitle);
  const date = parseEventDate(event);
  const fire = counts?.fire ?? 0;
  const going = counts?.going ?? 0;
  const songs = counts?.songs ?? 0;
  const image = buildImageBackground(event, index);

  return {
    artist: event.artistName,
    dateLabel: formatMonthDay(date),
    dayLabel: formatWeekday(date),
    detailHref: `/event/${event.id}`,
    eventUrl: event.eventUrl,
    fire,
    fireSelected,
    going,
    goingSelected,
    id: event.id,
    image,
    initials,
    match: formatMatchScore(score, index),
    note: buildNote({ counts, event, score, tag }),
    songs,
    tag,
    time: event.eventTime ?? "Time TBA",
    title: event.eventTitle,
    venue: event.venueName,
  };
}

function buildImageBackground(event: EventRecord, index: number) {
  const accent = [
    "rgba(255, 237, 213, 0.88)",
    "rgba(251, 146, 60, 0.74)",
    "rgba(244, 244, 245, 0.62)",
    "rgba(161, 161, 170, 0.58)",
    "rgba(212, 212, 216, 0.48)",
    "rgba(253, 186, 116, 0.58)",
  ][index % 6];
  const imageLayer = event.imageUrl
    ? `linear-gradient(145deg, rgba(10, 10, 10, 0.02), rgba(10, 10, 10, 0.78)), url(${JSON.stringify(event.imageUrl)})`
    : `linear-gradient(145deg, rgba(10, 10, 10, 0.08), rgba(10, 10, 10, 0.88)), radial-gradient(circle at ${24 + (index % 3) * 20}% ${18 + (index % 2) * 18}%, ${accent}, transparent 16rem)`;

  return `${imageLayer}, linear-gradient(135deg, #18181b 0%, #3f3f46 46%, #09090b 100%)`;
}

function buildNote({
  counts,
  event,
  score,
  tag,
}: {
  counts: CommunityCounts | undefined;
  event: EventRecord;
  score: DiscoveryScore | undefined;
  tag: string;
}) {
  const reason = score?.reasons[0]?.label ?? `${tag.toLowerCase()} signal`;
  const notes = counts?.notes ?? 0;
  const songs = counts?.songs ?? 0;

  if (notes > 0 || songs > 0) {
    return `${reason}: ${notes} notes and ${songs} songs are already attached to this listing.`;
  }

  return `${reason}: ${event.artistName} at ${event.venueName} is inside the current live music window.`;
}

function formatMatchScore(score: DiscoveryScore | undefined, index: number) {
  const rawScore = score?.bestMatchScore ?? 0;
  return Math.max(70, Math.min(98, Math.round(70 + rawScore / 3 - index * 1.3)));
}

function getPrimaryTag(event: EventRecord) {
  return event.tags.find((tag) => tag.toLowerCase() !== "live music") ?? event.tags[0] ?? "Live";
}

function getInitials(value: string) {
  const words = value
    .replace(/[^a-z0-9\s]/gi, " ")
    .split(/\s+/)
    .filter(Boolean);

  return (words[0]?.[0] ?? "A") + (words[1]?.[0] ?? words[0]?.[1] ?? "V");
}

function parseEventDate(event: EventRecord) {
  return new Date(event.startsAt ?? `${event.eventDate}T12:00:00`);
}

function formatWeekday(date: Date) {
  return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date);
}

function formatMonthDay(date: Date) {
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" }).format(date);
}
