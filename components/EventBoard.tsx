"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EventImage } from "@/components/EventImage";
import type { CommunityCounts } from "@/lib/community";
import type { EventRecord } from "@/lib/events";
import { formatDate } from "@/lib/format";

type SortMode = "soonest" | "hottest" | "discussion" | "venue";

type EventBoardProps = {
  counts: Record<string, CommunityCounts | undefined>;
  events: EventRecord[];
  windowLabel: string;
};

export function EventBoard({ counts, events, windowLabel }: EventBoardProps) {
  const [query, setQuery] = useState("");
  const [venue, setVenue] = useState("all");
  const [tag, setTag] = useState("all");
  const [sortMode, setSortMode] = useState<SortMode>("soonest");

  const venues = useMemo(
    () => Array.from(new Set(events.map((event) => event.venueName))).sort(),
    [events]
  );
  const tags = useMemo(
    () => Array.from(new Set(events.flatMap((event) => event.tags))).sort(),
    [events]
  );

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return events
      .filter((event) => {
        const haystack = [
          event.eventTitle,
          event.artistName,
          event.venueName,
          event.eventDate,
          event.eventTime ?? "",
          ...event.tags,
        ]
          .join(" ")
          .toLowerCase();

        return normalizedQuery ? haystack.includes(normalizedQuery) : true;
      })
      .filter((event) => (venue === "all" ? true : event.venueName === venue))
      .filter((event) => (tag === "all" ? true : event.tags.includes(tag)))
      .sort((a, b) => compareEvents(a, b, counts, sortMode));
  }, [counts, events, query, sortMode, tag, venue]);

  function clearFilters() {
    setQuery("");
    setVenue("all");
    setTag("all");
    setSortMode("soonest");
  }

  return (
    <>
      <section className="search-panel" aria-label="Discovery controls">
        <input
          className="search-input"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search artists, venues, notes..."
          type="search"
          value={query}
        />
        <div className="filter-row">
          <select
            aria-label="Filter by venue"
            className="filter-control"
            onChange={(event) => setVenue(event.target.value)}
            value={venue}
          >
            <option value="all">All venues</option>
            {venues.map((venueName) => (
              <option key={venueName} value={venueName}>
                {venueName}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by tag"
            className="filter-control"
            onChange={(event) => setTag(event.target.value)}
            value={tag}
          >
            <option value="all">All tags</option>
            {tags.map((tagName) => (
              <option key={tagName} value={tagName}>
                {tagName}
              </option>
            ))}
          </select>
          <select
            aria-label="Sort events"
            className="filter-control"
            onChange={(event) => setSortMode(event.target.value as SortMode)}
            value={sortMode}
          >
            <option value="soonest">Soonest first</option>
            <option value="hottest">Hottest</option>
            <option value="discussion">Most discussed</option>
            <option value="venue">Venue A-Z</option>
          </select>
          <button className="filter-reset" onClick={clearFilters} type="button">
            Reset
          </button>
        </div>
      </section>

      <section className="toolbar" aria-label="Event list summary">
        <div>
          <span className="toolbar-label">Window</span>
          <strong>{windowLabel}</strong>
        </div>
        <div>
          <span className="toolbar-label">Showing</span>
          <strong>
            {filteredEvents.length} of {events.length} music events
          </strong>
        </div>
        <div>
          <span className="toolbar-label">Sort</span>
          <strong>{sortLabels[sortMode]}</strong>
        </div>
      </section>

      {filteredEvents.length === 0 ? (
        <section className="empty-state">
          <h2>No matching music events</h2>
          <p>Try clearing a filter or searching for a different artist, venue, or tag.</p>
        </section>
      ) : (
        <section className="event-grid" id="shows" aria-label="Upcoming music events">
          {filteredEvents.map((event) => (
            <article className="event-card" key={event.id}>
              <div className="date-block">
                <span>{formatDate(event.eventDate).split(" ")[0]}</span>
                <strong>{formatDate(event.eventDate).replace(/^[A-Za-z]+ /, "")}</strong>
              </div>

              <EventImage
                className="event-image"
                fallbackLabel={event.eventTitle}
                src={event.imageUrl}
              />

              <div className="event-card-body">
                <p className="card-kicker">{event.venueName}</p>
                <h2>{event.eventTitle}</h2>
                <p className="event-meta">
                  {event.eventTime ? event.eventTime : "Time TBA"} · {event.artistName}
                </p>
                <div className="tag-row">
                  {event.tags.slice(0, 3).map((tagName) => (
                    <span key={tagName}>{tagName}</span>
                  ))}
                </div>
                <div className="signal-row" aria-label="Community signals">
                  <span>{counts[event.id]?.going ?? 0} going</span>
                  <span>{counts[event.id]?.notes ?? 0} notes</span>
                  <span>{counts[event.id]?.songs ?? 0} songs</span>
                  <span>{counts[event.id]?.fire ?? 0} hot</span>
                </div>
                <div className="card-actions">
                  <Link href={`/event/${event.id}`}>View details</Link>
                  <a href={event.eventUrl} target="_blank">
                    AVLgo listing
                  </a>
                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}

const sortLabels: Record<SortMode, string> = {
  soonest: "Soonest first",
  hottest: "Hottest",
  discussion: "Most discussed",
  venue: "Venue A-Z",
};

function compareEvents(
  a: EventRecord,
  b: EventRecord,
  counts: EventBoardProps["counts"],
  sortMode: SortMode
) {
  if (sortMode === "venue") {
    return a.venueName.localeCompare(b.venueName) || soonest(a, b);
  }

  if (sortMode === "hottest") {
    return scoreHeat(b, counts) - scoreHeat(a, counts) || soonest(a, b);
  }

  if (sortMode === "discussion") {
    return scoreDiscussion(b, counts) - scoreDiscussion(a, counts) || soonest(a, b);
  }

  return soonest(a, b);
}

function scoreHeat(event: EventRecord, counts: EventBoardProps["counts"]) {
  const eventCounts = counts[event.id];
  return (eventCounts?.fire ?? 0) * 3 + (eventCounts?.going ?? 0) * 2 + scoreDiscussion(event, counts);
}

function scoreDiscussion(event: EventRecord, counts: EventBoardProps["counts"]) {
  const eventCounts = counts[event.id];
  return (eventCounts?.notes ?? 0) + (eventCounts?.songs ?? 0) + (eventCounts?.voices ?? 0);
}

function soonest(a: EventRecord, b: EventRecord) {
  return getEventTime(a) - getEventTime(b);
}

function getEventTime(event: EventRecord) {
  if (event.startsAt) {
    return new Date(event.startsAt).getTime();
  }

  return new Date(`${event.eventDate}T00:00:00`).getTime();
}
