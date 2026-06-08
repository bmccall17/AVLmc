import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import { UserCircle } from "lucide-react";
import {
  FreshDiscoveryExperience,
  type FreshSandboxEvent,
} from "@/app/sandbox/discovery-actions/FreshDiscoveryExperience";
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
  const eventIds = allEvents.map((event) => event.id);
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
    events: allEvents,
    preferenceSignals,
    profileItems: musicProfileItems,
    spotifyMatchCorrections,
  });
  const events = allEvents.filter((event) => !discoveryStates[event.id]?.removed).slice(0, 9);
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
  const profileLabel = userId ? "Signed in listener" : "Guest listener";
  const profileDetail =
    musicProfileItems.length > 0
      ? `${musicProfileItems.length} taste signals`
      : userId
        ? "Manage discovery"
        : "Connect Spotify";

  return (
    <main className="sandbox-shell">
      <header className="sandbox-topbar">
        <Link className="sandbox-brand" href="/">
          <Image src="/icon.png" alt="AVLmc logo" width={42} height={42} className="sandbox-brand-mark" />
          <div>
            <strong>AVLmc</strong>
            <small>Asheville Music Companion</small>
          </div>
        </Link>
        <nav className="sandbox-tabs" aria-label="Sandbox sections">
          <a href="#discover" aria-current="page">Discover</a>
          <a href="#beats">Beats</a>
          <a href="#cards">Cards</a>
        </nav>
        <Link
          aria-label={userId ? "Manage personalized discovery" : "Connect Spotify for personalized discovery"}
          className="sandbox-profile"
          href="/#personalized-discovery"
        >
          <UserCircle aria-hidden="true" size={22} strokeWidth={2.2} />
          <span>
            <strong>{profileLabel}</strong>
            <small>{profileDetail}</small>
          </span>
        </Link>
      </header>

      <FreshDiscoveryExperience events={cards} />
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
}): FreshSandboxEvent {
  const tag = getPrimaryTag(event);
  const initials = getInitials(event.artistName || event.eventTitle);
  const date = parseEventDate(event);
  const fire = counts?.fire ?? 0;
  const going = counts?.going ?? 0;
  const songs = counts?.songs ?? 0;

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
    imageUrl: event.imageUrl,
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
