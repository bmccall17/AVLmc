import Link from "next/link";
import { EventBoard } from "@/components/EventBoard";
import { EventImage } from "@/components/EventImage";
import { getCommunityCountsByEvent } from "@/lib/community";
import { getDateWindow, getUpcomingEvents } from "@/lib/events";
import { formatWindow } from "@/lib/format";

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
  const counts = await getCommunityCountsByEvent(events.map((event) => event.id));
  const { start, end } = getDateWindow();
  const avlgoSourceUrl = buildAvlgoSourceUrl(start, end);
  const featured = events[0] ?? null;

  return (
    <main className="shell">
      <header className="app-chrome">
        <Link className="brand" href="/">
          <span className="brand-mark">AVL</span>
          <span>
            <strong>AVL Show Notes</strong>
            <small>Upcoming shows in the 828</small>
          </span>
        </Link>
        <nav className="nav-pills" aria-label="Primary">
          <a href="#shows" aria-current="page">Shows</a>
          <a href="#hot">Hot</a>
          <a href="#stories">Stories</a>
        </nav>
        <div className="header-actions">
          <a
            className="playlist-button"
            href="https://open.spotify.com/playlist/4fcdaCe97lEeEMe8rOhuSM?si=BcTWAtvxQqu3kRlZDlIuBQ"
            target="_blank"
          >
            Ryan&apos;s weekly playlist
          </a>
          <a className="ghost-button" href={avlgoSourceUrl} target="_blank">
            AVLgo source
          </a>
        </div>
      </header>

      <section className="hero-band">
        <div className="hero-copy">
          <p className="eyebrow">Live AVLgo feed</p>
          <h1>Find the Asheville show worth talking about.</h1>
          <p className="lede">
            A rolling 21-day live music board, with local notes and listening
            signals layered on top.
          </p>
        </div>
        {featured ? (
          <Link className="featured-show" href={`/event/${featured.id}`}>
            <EventImage
              className="featured-image"
              src={featured.imageUrl}
              fallbackLabel={featured.eventTitle}
              loading="eager"
            />
            <span className="featured-copy">
              <small>Next up</small>
              <strong>{featured.eventTitle}</strong>
              <em>
                {featured.eventTime ?? "Time TBA"} at {featured.venueName}
              </em>
            </span>
          </Link>
        ) : null}
      </section>

      {events.length === 0 ? (
        <section className="empty-state">
          <h2>No upcoming music events found</h2>
          <p>
            The board is ready, but the current AVLgo feed did not return music
            events inside the next 21 days.
          </p>
        </section>
      ) : (
        <EventBoard counts={counts} events={events} windowLabel={formatWindow(start, end)} />
      )}
    </main>
  );
}
