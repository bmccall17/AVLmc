import Link from "next/link";
import { notFound } from "next/navigation";
import { CommunityPanel } from "@/components/CommunityPanel";
import { EventImage } from "@/components/EventImage";
import { getCommunityForEvent, publicContribution } from "@/lib/community";
import { getOptionalUserId } from "@/lib/current-user";
import { getEventById } from "@/lib/events";
import { formatLongDate } from "@/lib/format";
import { listMusicConnections } from "@/lib/music";

type EventPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export const dynamic = "force-dynamic";

export default async function EventPage({ params }: EventPageProps) {
  const { id } = await params;
  const event = await getEventById(id);

  if (!event) {
    notFound();
  }

  const community = await getCommunityForEvent(event.id);
  const userId = await getOptionalUserId();
  const musicConnections = userId ? await listMusicConnections(userId) : [];
  const spotifySearchEnabled = musicConnections.some(
    (connection) => connection.provider === "spotify" && !connection.disconnectedAt
  );
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
          <p className="eyebrow">{event.venueName}</p>
          <h1>{event.eventTitle}</h1>
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
              <dd>{event.artistName}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{event.source}</dd>
            </div>
          </dl>
          <a className="primary-action" href={event.eventUrl} target="_blank">
            View original AVLgo listing
          </a>
        </div>
      </article>

      <CommunityPanel
        event={{
          id: event.id,
          artistName: event.artistName,
          eventTitle: event.eventTitle,
        }}
        initialCommunity={publicCommunity}
        spotifySearchEnabled={spotifySearchEnabled}
      />
    </main>
  );
}
