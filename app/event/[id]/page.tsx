import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { CommunityPanel } from "@/components/CommunityPanel";
import { EventImage } from "@/components/EventImage";
import { SaveButton } from "@/components/SaveButton";
import { SharedListening } from "@/components/SharedListening";
import { TicketIntentLink } from "@/components/TicketIntentLink";
import {
  ANONYMOUS_SESSION_COOKIE_NAME,
  getAnonymousSessionIdFromCookieValue,
} from "@/lib/anonymous-session";
import { getCommunityForEvent, publicContribution } from "@/lib/community";
import { getOptionalUserId } from "@/lib/current-user";
import { normalizeText } from "@/lib/discovery";
import { listDiscoveryStates } from "@/lib/discovery-memory";
import { getEventById } from "@/lib/events";
import { formatLongDate } from "@/lib/format";
import { listMusicConnections } from "@/lib/music";
import { getSavedKeys } from "@/lib/saved-items";
import { listPublicSharedSongs } from "@/lib/shared-songs";

type EventPageProps = {
  params: Promise<{
    id: string;
  }>;
};

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

  const community = await getCommunityForEvent(event.id);
  const userId = await getOptionalUserId();
  const cookieStore = await cookies();
  const sessionId = getAnonymousSessionIdFromCookieValue(
    cookieStore.get(ANONYMOUS_SESSION_COOKIE_NAME)?.value
  );
  const [musicConnections, discoveryStates, savedKeys, sharedSongs] = await Promise.all([
    userId ? listMusicConnections(userId) : Promise.resolve([]),
    listDiscoveryStates([event.id], { sessionId, userId }),
    userId ? getSavedKeys(userId) : Promise.resolve([]),
    listPublicSharedSongs(event.id, userId),
  ]);
  const spotifySearchEnabled = musicConnections.some(
    (connection) => connection.provider === "spotify" && !connection.disconnectedAt
  );
  const isSignedIn = Boolean(userId);
  const savedKeySet = new Set(savedKeys.map((key) => `${key.itemType}:${key.itemKey}`));
  const eventSaved = savedKeySet.has(`event:${event.id}`);
  const venueSaved = savedKeySet.has(`venue:${normalizeText(event.venueName)}`);
  const artistSaved = savedKeySet.has(`artist:${normalizeText(event.artistName)}`);
  const publicCommunity = {
    ...community,
    contributions: community.contributions.map(publicContribution),
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
              <dd>{event.source}</dd>
            </div>
          </dl>
          <TicketIntentLink
            className="primary-action"
            eventId={event.id}
            eventTitle={event.eventTitle}
            href={event.eventUrl}
          >
            View original AVLgo listing
          </TicketIntentLink>
        </div>
      </article>

      <CommunityPanel
        event={{
          id: event.id,
          artistName: event.artistName,
          eventUrl: event.eventUrl,
          eventTitle: event.eventTitle,
        }}
        initialDiscoveryState={discoveryStates[event.id]}
        initialCommunity={publicCommunity}
        spotifySearchEnabled={spotifySearchEnabled}
      />

      <SharedListening eventId={event.id} initialSongs={sharedSongs} />
    </main>
  );
}
