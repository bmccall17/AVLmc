import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import { UserCircle } from "lucide-react";
import { EventBoard } from "@/components/EventBoard";
import { MusicAccountPanel } from "@/components/MusicAccountPanel";
import {
  ANONYMOUS_SESSION_COOKIE_NAME,
  getAnonymousSessionIdFromCookieValue,
} from "@/lib/anonymous-session";
import { getCommunityCountsByEvent } from "@/lib/community";
import { getOptionalUserId } from "@/lib/current-user";
import { scoreDiscoveryEvents } from "@/lib/discovery";
import {
  listDiscoveryPreferenceSignals,
  listDiscoveryStates,
  listSpotifyMatchCorrections,
} from "@/lib/discovery-memory";
import { getDateWindow, getUpcomingEvents } from "@/lib/events";
import { formatWindow } from "@/lib/format";
import { listMusicConnections, listMusicProfileItems } from "@/lib/music";

function formatDateParam(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function buildAvlgoSourceUrl(start: Date, end: Date) {
  const url = new URL("https://www.avlgo.com/events");

  url.searchParams.set("dateFilter", "custom");
  url.searchParams.set("dateStart", formatDateParam(start));
  url.searchParams.set("dateEnd", formatDateParam(end));
  url.searchParams.set("tagsInclude", "Live Music");

  return url.toString();
}

export default async function HomePage() {
  const events = await getUpcomingEvents();
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
  ] =
    await Promise.all([
      getCommunityCountsByEvent(eventIds),
      userId ? listMusicConnections(userId) : Promise.resolve([]),
      userId ? listMusicProfileItems(userId) : Promise.resolve([]),
      listDiscoveryStates(eventIds, { sessionId, userId }),
      listDiscoveryPreferenceSignals({ sessionId, userId }),
      listSpotifyMatchCorrections(eventIds, { sessionId, userId }),
    ]);
  const discoveryScores = scoreDiscoveryEvents({
    connections: musicConnections,
    counts,
    events,
    preferenceSignals,
    profileItems: musicProfileItems,
    spotifyMatchCorrections,
  });
  const visibleEvents = events.filter((event) => !discoveryStates[event.id]?.removed);
  const hasTasteProfile =
    musicProfileItems.length > 0 &&
    musicConnections.some(
      (connection) =>
        connection.provider === "spotify" &&
        !connection.disconnectedAt &&
        !connection.tasteOptOutAt
    );
  const { start, end } = getDateWindow();
  const avlgoSourceUrl = buildAvlgoSourceUrl(start, end);
  const profileLabel = userId ? "Signed in listener" : "Guest listener";
  const profileDetail = hasTasteProfile
    ? `${musicProfileItems.length} taste signals`
    : `${visibleEvents.length} live picks`;

  return (
    <main className="sandbox-shell">
      <header className="sandbox-topbar">
        <Link className="sandbox-brand" href="/">
          <Image src="/icon.png" alt="AVLmc logo" width={34} height={34} className="sandbox-brand-mark" />
          <strong>Asheville Music Connection</strong>
        </Link>
        <nav className="sandbox-tabs" aria-label="Primary">
          <a href="#discover" aria-current="page">Discover</a>
          <a href="#beats">Beats</a>
          <a href="#cards">Cards</a>
        </nav>
        <div className="sandbox-topbar-actions">
          <a
            className="sandbox-source-link is-playlist"
            href="https://open.spotify.com/playlist/4fcdaCe97lEeEMe8rOhuSM?si=BcTWAtvxQqu3kRlZDlIuBQ"
            rel="noreferrer"
            target="_blank"
          >
            Ryan&apos;s playlist
          </a>
          <a className="sandbox-source-link" href={avlgoSourceUrl} rel="noreferrer" target="_blank">
            AVLgo source
          </a>
          <button className="sandbox-profile" type="button">
            <UserCircle aria-hidden="true" size={22} strokeWidth={2.2} />
            <span>
              <strong>{profileLabel}</strong>
              <small>{profileDetail}</small>
            </span>
          </button>
        </div>
      </header>

      <MusicAccountPanel />

      {events.length === 0 ? (
        <section className="empty-state">
          <h2>No upcoming music events found</h2>
          <p>
            The board is ready, but the current AVLgo feed did not return music
            events inside the next 21 days.
          </p>
        </section>
      ) : (
        <EventBoard
          counts={counts}
          discoveryScores={discoveryScores}
          events={visibleEvents}
          hasTasteProfile={hasTasteProfile}
          initialDiscoveryStates={discoveryStates}
          windowLabel={formatWindow(start, end)}
        />
      )}
    </main>
  );
}
