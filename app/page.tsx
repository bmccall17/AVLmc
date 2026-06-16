import Link from "next/link";
import Image from "next/image";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { EventBoard } from "@/components/EventBoard";
import { ListenerProfileButton, type ListenerScorePreview } from "@/components/ListenerProfileButton";
import {
  ANONYMOUS_SESSION_COOKIE_NAME,
  getAnonymousSessionIdFromCookieValue,
} from "@/lib/anonymous-session";
import { getAuthFeatureFlags } from "@/lib/auth-flags";
import { getCommunityCountsByEvent } from "@/lib/community";
import { scoreDiscoveryEvents, type DiscoveryScore } from "@/lib/discovery";
import {
  listDiscoveryPreferenceSignals,
  listDiscoveryStates,
  listSpotifyMatchCorrections,
} from "@/lib/discovery-memory";
import { getDateWindow, getUpcomingEvents } from "@/lib/events";
import { formatWindow } from "@/lib/format";
import { AVLGO_TOP_30_URL, getAvlgoTop30EventIds } from "@/lib/local-pulse";
import { DEFAULT_LISTENER_DISCOVERY_PREFERENCES } from "@/lib/listener-preferences";
import { getListenerDiscoveryPreferences } from "@/lib/listener-preferences-store";
import { listMusicConnections, listMusicProfileItems } from "@/lib/music";
import { getSavedKeys } from "@/lib/saved-items";
import { SPOTIFY_LIMITED_BETA_CODE } from "@/lib/spotify-limited-access";

// Reads cookies/auth and queries the DB on render. Force dynamic so Next.js skips the
// build-time render pass that would otherwise open DB connections and risk exhausting
// the Neon pool (53300 too_many_connections) during the build.
export const dynamic = "force-dynamic";

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

type HomePageProps = {
  searchParams?: Promise<{
    spotify?: string;
  }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const spotifyLimitedBetaNotice = params?.spotify === SPOTIFY_LIMITED_BETA_CODE;
  const events = await getUpcomingEvents();
  const eventIds = events.map((event) => event.id);
  const cookieStore = await cookies();
  const sessionId = getAnonymousSessionIdFromCookieValue(
    cookieStore.get(ANONYMOUS_SESSION_COOKIE_NAME)?.value
  );
  const features = getAuthFeatureFlags();
  const session = features.auth ? await auth().catch(() => null) : null;
  const user = session?.user?.id
    ? {
        email: session.user.email,
        id: session.user.id,
        image: session.user.image,
        name: session.user.name,
      }
    : null;
  const userId = user?.id ?? null;
  const [
    counts,
    musicConnections,
    musicProfileItems,
    discoveryStates,
    preferenceSignals,
    spotifyMatchCorrections,
    listenerPreferences,
    avlgoTop30EventIds,
    savedKeys,
  ] =
    await Promise.all([
      getCommunityCountsByEvent(eventIds),
      userId ? listMusicConnections(userId) : Promise.resolve([]),
      userId ? listMusicProfileItems(userId) : Promise.resolve([]),
      listDiscoveryStates(eventIds, { sessionId, userId }),
      listDiscoveryPreferenceSignals({ sessionId, userId }),
      listSpotifyMatchCorrections(eventIds, { sessionId, userId }),
      userId ? getListenerDiscoveryPreferences(userId) : Promise.resolve(undefined),
      getAvlgoTop30EventIds(events),
      userId ? getSavedKeys(userId) : Promise.resolve([]),
    ]);
  const savedEventKeys = savedKeys
    .filter((key) => key.itemType === "event")
    .map((key) => key.itemKey);
  const activeListenerPreferences = listenerPreferences ?? DEFAULT_LISTENER_DISCOVERY_PREFERENCES;
  const discoveryScores = scoreDiscoveryEvents({
    connections: musicConnections,
    counts,
    events,
    listenerPreferences: activeListenerPreferences,
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
  const scorePreview = getScorePreview(visibleEvents, discoveryScores);

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
        <nav className="sandbox-tabs" aria-label="Discovery views">
          <a href="#for-you" aria-current="page">For You</a>
          <a href="#local-pulse">Local Pulse</a>
          <a href="#curators">Curators</a>
        </nav>
        <div className="sandbox-topbar-actions">
          <a className="sandbox-source-link" href={AVLGO_TOP_30_URL} rel="noreferrer" target="_blank">
            Top 30 source
          </a>
          <a className="sandbox-source-link" href={avlgoSourceUrl} rel="noreferrer" target="_blank">
            AVLgo feed
          </a>
          <ListenerProfileButton
            features={features}
            hasTasteProfile={hasTasteProfile}
            initialPreferences={activeListenerPreferences}
            musicConnections={musicConnections}
            musicProfileItems={musicProfileItems}
            scorePreview={scorePreview}
            spotifyLimitedBetaNotice={spotifyLimitedBetaNotice}
            user={user}
          />
        </div>
      </header>

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
          events={events}
          hasTasteProfile={hasTasteProfile}
          initialDiscoveryStates={discoveryStates}
          initialListenerPreferences={activeListenerPreferences}
          initialSavedEventKeys={savedEventKeys}
          isSignedIn={Boolean(userId)}
          musicConnections={musicConnections}
          musicProfileItems={musicProfileItems}
          preferenceSignals={preferenceSignals}
          spotifyMatchCorrections={spotifyMatchCorrections}
          top30EventIds={avlgoTop30EventIds}
          top30SourceUrl={AVLGO_TOP_30_URL}
          windowLabel={formatWindow(start, end)}
        />
      )}
    </main>
  );
}

function getScorePreview(
  events: Awaited<ReturnType<typeof getUpcomingEvents>>,
  discoveryScores: Record<string, DiscoveryScore | undefined>
): ListenerScorePreview | null {
  const topEvent = [...events].sort((left, right) => {
    const leftScore = discoveryScores[left.id]?.bestMatchScore ?? discoveryScores[left.id]?.bestBetsScore ?? 0;
    const rightScore = discoveryScores[right.id]?.bestMatchScore ?? discoveryScores[right.id]?.bestBetsScore ?? 0;
    return rightScore - leftScore;
  })[0];

  if (!topEvent) {
    return null;
  }

  const score = discoveryScores[topEvent.id];

  if (!score) {
    return null;
  }

  return {
    components: score.components,
    eventTitle: topEvent.eventTitle,
    matchPercent: Math.max(70, Math.min(98, Math.round(70 + score.bestMatchScore / 3))),
    reasons: score.reasons.map((reason) => reason.label),
  };
}
