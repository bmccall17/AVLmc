import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { ArtistEmbed } from "@/components/ArtistEmbed";
import { CirclePresence } from "@/components/CirclePresence";
import { CommunityPanel } from "@/components/CommunityPanel";
import { EventImage } from "@/components/EventImage";
import { SaveButton } from "@/components/SaveButton";
import { SharedListening } from "@/components/SharedListening";
import { TicketIntentLink } from "@/components/TicketIntentLink";
import {
  ANONYMOUS_SESSION_COOKIE_NAME,
  getAnonymousSessionIdFromCookieValue,
} from "@/lib/anonymous-session";
import { getPublicEventContext } from "@/lib/board-data";
import { publicContribution } from "@/lib/community";
import { getOptionalUserId } from "@/lib/current-user";
import { normalizeText } from "@/lib/discovery";
import { listDiscoveryStates } from "@/lib/discovery-memory";
import { getEventById } from "@/lib/events";
import { formatLongDate } from "@/lib/format";
import { listMusicConnections } from "@/lib/music";
import { getSavedKeys } from "@/lib/saved-items";
import { listPublicSharedSongs } from "@/lib/shared-songs";
import { attributeSharedSongs, getCircleEventActivity } from "@/lib/social-activity";

type EventPageProps = {
  params: Promise<{
    id: string;
  }>;
};

// Per-request by nature (cookies/session drive save state, discovery state, and circle
// attribution); force dynamic also skips the build-time render pass that would open DB
// connections. The PRD 51 cost decoupling is in the data layer: the event row and the public
// context (community, shared songs, curated-by, artist match) are cached and write-invalidated,
// so an anonymous view costs zero DB queries.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: EventPageProps): Promise<Metadata> {
  const { id } = await params;
  const event = await getEventById(id);

  if (!event) {
    return { title: "Event Not Found — AVL Music Companion" };
  }

  const formattedDate = formatLongDate(event.eventDate);
  const time = event.eventTime ?? "Time TBA";
  const title = `${event.eventTitle} at ${event.venueName} — AVL Music Companion`;
  const description = `${event.artistName} · ${formattedDate} · ${time} · ${event.venueName}`;

  return {
    title,
    description,
    openGraph: {
      title: event.eventTitle,
      description,
      type: "website",
      siteName: "AVL Music Companion",
    },
    twitter: {
      card: "summary_large_image",
      title: event.eventTitle,
      description,
    },
  };
}

export default async function EventPage({ params }: EventPageProps) {
  const { id } = await params;
  const event = await getEventById(id);

  if (!event) {
    notFound();
  }

  const userId = await getOptionalUserId();
  const cookieStore = await cookies();
  const sessionId = getAnonymousSessionIdFromCookieValue(
    cookieStore.get(ANONYMOUS_SESSION_COOKIE_NAME)?.value
  );
  const [
    // Cached, viewer-independent payload (community, shared songs, curated-by, artist match) —
    // one shared entry per event, write-invalidated via the `event-signals` tag (PRD 51).
    publicContext,
    musicConnections,
    discoveryStates,
    savedKeys,
    circleActivityByEvent,
  ] = await Promise.all([
    getPublicEventContext(event.id),
    userId ? listMusicConnections(userId) : Promise.resolve([]),
    listDiscoveryStates([event.id], { sessionId, userId }),
    userId ? getSavedKeys(userId) : Promise.resolve([]),
    getCircleEventActivity(userId, [event.id]),
  ]);
  const { community, curatedBy, artistMatch } = publicContext;
  // Signed-in viewers re-read the shared list with their own top-tracks badge matching; the
  // anonymous shape comes straight from the cached context.
  const publicSharedSongs = userId
    ? await listPublicSharedSongs(event.id, userId)
    : publicContext.sharedSongs;
  // Attribute in-circle seeders server-side at the gate (no-op for anonymous viewers).
  const sharedSongs = userId
    ? await attributeSharedSongs(userId, event.id, publicSharedSongs)
    : publicSharedSongs;
  const circleActivity = circleActivityByEvent[event.id] ?? null;
  const spotifySearchEnabled = musicConnections.some(
    (connection) => connection.provider === "spotify" && !connection.disconnectedAt
  );
  const isSignedIn = Boolean(userId);
  const savedKeySet = new Set(savedKeys.map((key) => `${key.itemType}:${key.itemKey}`));
  const eventSaved = savedKeySet.has(`event:${event.id}`);
  const venueSaved = savedKeySet.has(`venue:${normalizeText(event.venueName)}`);
  const artistSaved = savedKeySet.has(`artist:${normalizeText(event.artistName)}`);
  const sourceHost = getSourceHost(event.eventUrl);
  const sourceTooltipId = `source-tooltip-${event.id}`;
  const publicCommunity = {
    ...community,
    contributions: community.contributions.map((c) => publicContribution(c, userId)),
  };

  return (
    <main className="shell detail-shell">
      <Link className="back-link" href="/">
        Back to all shows
      </Link>

      <article className="detail-hero">
        <EventImage
          className="detail-image"
          fallbackLabel={event.eventTitle}
          loading="eager"
          src={event.imageUrl}
        />

        <div className="detail-copy">
          <p className="eyebrow detail-venue-line">
            <span>{event.venueName}</span>
            <SaveButton
              initialSaved={venueSaved}
              isSignedIn={isSignedIn}
              itemKey={event.venueName}
              itemType="venue"
              label={event.venueName}
              variant="chip"
            />
          </p>
          <h1>{event.eventTitle}</h1>
          <div className="detail-save-row">
            <SaveButton
              eventId={event.id}
              initialSaved={eventSaved}
              isSignedIn={isSignedIn}
              itemKey={event.id}
              itemType="event"
              label={event.eventTitle}
              variant="chip"
            />
          </div>
          <dl className="detail-list">
            <div>
              <dt>Date</dt>
              <dd>{formatLongDate(event.eventDate)}</dd>
            </div>
            <div>
              <dt>Time</dt>
              <dd>{event.eventTime ?? "Time TBA"}</dd>
            </div>
            <div>
              <dt>Artist</dt>
              <dd className="detail-artist-line">
                <span>{event.artistName}</span>
                <SaveButton
                  initialSaved={artistSaved}
                  isSignedIn={isSignedIn}
                  itemKey={event.artistName}
                  itemType="artist"
                  label={event.artistName}
                  variant="chip"
                />
              </dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd className="source-cell">
                <TicketIntentLink
                  className="source-link"
                  ariaDescribedBy={sourceTooltipId}
                  ariaLabel={`Open original listing. Source: ${event.source}${
                    sourceHost ? ` at ${sourceHost}` : ""
                  }.`}
                  eventId={event.id}
                  eventTitle={event.eventTitle}
                  href={event.eventUrl}
                >
                  <span>Source</span>
                  <ExternalLink aria-hidden="true" size={15} strokeWidth={2.4} />
                </TicketIntentLink>
                <span className="source-tooltip" id={sourceTooltipId} role="tooltip">
                  <strong>{sourceHost ? `Original listing on ${sourceHost}` : "Original listing"}</strong>
                  <span>
                    Pulled from {event.source}. Opens external tickets and listing details in a
                    new tab.
                  </span>
                </span>
              </dd>
            </div>
          </dl>
        </div>
      </article>

      <CommunityPanel
        curatedBy={curatedBy}
        event={{
          id: event.id,
          artistName: event.artistName,
          eventTitle: event.eventTitle,
        }}
        initialDiscoveryState={discoveryStates[event.id]}
        initialCommunity={publicCommunity}
        spotifySearchEnabled={spotifySearchEnabled}
        topTracksSlot={
          artistMatch ? (
            <ArtistEmbed
              artistName={event.artistName}
              eventId={event.id}
              isSignedIn={isSignedIn}
              spotifyArtistId={artistMatch.spotifyArtistId}
              spotifyArtistName={artistMatch.spotifyArtistName}
              spotifyConnected={spotifySearchEnabled}
            />
          ) : null
        }
      />

      <CirclePresence activity={circleActivity} />

      <SharedListening
        eventId={event.id}
        eventTitle={event.eventTitle}
        initialSongs={sharedSongs}
        isSignedIn={isSignedIn}
      />
    </main>
  );
}

function getSourceHost(href: string) {
  try {
    const host = new URL(href).hostname.replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}
