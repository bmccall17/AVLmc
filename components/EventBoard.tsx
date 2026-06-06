"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { EventImage } from "@/components/EventImage";
import type { CommunityCounts } from "@/lib/community";
import type { DiscoveryScoresByEvent } from "@/lib/discovery";
import type { EventRecord } from "@/lib/events";
import { formatDate } from "@/lib/format";

type SortMode = "best-bets" | "best-match" | "soonest" | "hottest" | "discussion" | "venue";
type QuickFilterId = "tonight" | "weekend" | "free" | "dance" | "jazz" | "rock" | "local" | "outdoor";

type EventBoardProps = {
  counts: Record<string, CommunityCounts | undefined>;
  discoveryScores: DiscoveryScoresByEvent;
  events: EventRecord[];
  hasTasteProfile: boolean;
  windowLabel: string;
};

export function EventBoard({
  counts,
  discoveryScores,
  events,
  hasTasteProfile,
  windowLabel,
}: EventBoardProps) {
  const [query, setQuery] = useState("");
  const [venue, setVenue] = useState("all");
  const [tag, setTag] = useState("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilterId | "all">("all");
  const [sortMode, setSortMode] = useState<SortMode>(hasTasteProfile ? "best-match" : "best-bets");
  const rankedVenues = useMemo(() => rankValues(events.map((event) => event.venueName)).slice(0, 8), [events]);
  const allVenues = useMemo(() => Array.from(new Set(events.map((event) => event.venueName))).sort(), [events]);
  const rankedTags = useMemo(
    () => rankValues(events.flatMap((event) => event.tags).filter(isUsefulTag)).slice(0, 10),
    [events]
  );
  const allTags = useMemo(() => Array.from(new Set(events.flatMap((event) => event.tags))).sort(), [events]);

  useEffect(() => {
    if (!hasTasteProfile && sortMode === "best-match") {
      setSortMode("best-bets");
    }
  }, [hasTasteProfile, sortMode]);

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const activeQuickFilter = quickFilters.find((filter) => filter.id === quickFilter);

    return events
      .filter((event) => matchesSearch(event, normalizedQuery))
      .filter((event) => (venue === "all" ? true : event.venueName === venue))
      .filter((event) => (tag === "all" ? true : event.tags.includes(tag)))
      .filter((event) => (activeQuickFilter ? activeQuickFilter.matches(event) : true))
      .sort((a, b) => compareEvents(a, b, counts, discoveryScores, sortMode));
  }, [counts, discoveryScores, events, query, quickFilter, sortMode, tag, venue]);

  function clearFilters() {
    setQuery("");
    setVenue("all");
    setTag("all");
    setQuickFilter("all");
    setSortMode(hasTasteProfile ? "best-match" : "best-bets");
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

        <div className="filter-group" aria-label="Intent filters">
          {quickFilters.map((filter) => (
            <button
              aria-pressed={quickFilter === filter.id}
              className="filter-chip"
              key={filter.id}
              onClick={() => setQuickFilter(quickFilter === filter.id ? "all" : filter.id)}
              type="button"
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="filter-group" aria-label="Popular venue filters">
          {rankedVenues.map((venueName) => (
            <button
              aria-pressed={venue === venueName}
              className="filter-chip"
              key={venueName}
              onClick={() => setVenue(venue === venueName ? "all" : venueName)}
              type="button"
            >
              {venueName}
            </button>
          ))}
        </div>

        <div className="filter-group" aria-label="Popular tag filters">
          {rankedTags.map((tagName) => (
            <button
              aria-pressed={tag === tagName}
              className="filter-chip"
              key={tagName}
              onClick={() => setTag(tag === tagName ? "all" : tagName)}
              type="button"
            >
              {tagName}
            </button>
          ))}
        </div>

        <div className="filter-row">
          <select
            aria-label="Filter by venue"
            className="filter-control"
            onChange={(event) => setVenue(event.target.value)}
            value={venue}
          >
            <option value="all">All venues</option>
            {allVenues.map((venueName) => (
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
            {allTags.map((tagName) => (
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
            <option value="best-bets">Best Bets</option>
            {hasTasteProfile ? <option value="best-match">Best Match</option> : null}
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
          {filteredEvents.map((event) => {
            const score = discoveryScores[event.id];
            const reasons = score?.reasons ?? [];

            return (
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
                  {reasons.length > 0 ? (
                    <div className="reason-row" aria-label="Recommendation reasons">
                      {reasons.map((reason) => (
                        <span key={reason}>{reason}</span>
                      ))}
                    </div>
                  ) : null}
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
            );
          })}
        </section>
      )}
    </>
  );
}

const sortLabels: Record<SortMode, string> = {
  "best-bets": "Best Bets",
  "best-match": "Best Match",
  soonest: "Soonest first",
  hottest: "Hottest",
  discussion: "Most discussed",
  venue: "Venue A-Z",
};

const quickFilters: Array<{
  id: QuickFilterId;
  label: string;
  matches: (event: EventRecord) => boolean;
}> = [
  { id: "tonight", label: "Tonight", matches: isTonight },
  { id: "weekend", label: "This weekend", matches: isThisWeekend },
  { id: "free", label: "Free", matches: (event) => eventContains(event, ["free", "no cover"]) },
  { id: "dance", label: "Dance", matches: (event) => eventContains(event, ["dance", "dj"]) },
  { id: "jazz", label: "Jazz", matches: (event) => eventContains(event, ["jazz"]) },
  { id: "rock", label: "Rock", matches: (event) => eventContains(event, ["rock", "indie"]) },
  { id: "local", label: "Local", matches: (event) => eventContains(event, ["local", "asheville"]) },
  { id: "outdoor", label: "Outdoor", matches: (event) => eventContains(event, ["outdoor", "patio"]) },
];

function compareEvents(
  a: EventRecord,
  b: EventRecord,
  counts: EventBoardProps["counts"],
  discoveryScores: DiscoveryScoresByEvent,
  sortMode: SortMode
) {
  if (sortMode === "best-match") {
    return scoreBestMatch(b, discoveryScores) - scoreBestMatch(a, discoveryScores) || soonest(a, b);
  }

  if (sortMode === "best-bets") {
    return scoreBestBets(b, discoveryScores) - scoreBestBets(a, discoveryScores) || soonest(a, b);
  }

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

function scoreBestBets(event: EventRecord, discoveryScores: DiscoveryScoresByEvent) {
  return discoveryScores[event.id]?.bestBetsScore ?? 0;
}

function scoreBestMatch(event: EventRecord, discoveryScores: DiscoveryScoresByEvent) {
  return discoveryScores[event.id]?.bestMatchScore ?? scoreBestBets(event, discoveryScores);
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

function matchesSearch(event: EventRecord, normalizedQuery: string) {
  if (!normalizedQuery) {
    return true;
  }

  return eventContains(event, [normalizedQuery]);
}

function eventContains(event: EventRecord, terms: string[]) {
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

  return terms.some((term) => haystack.includes(term.toLowerCase()));
}

function rankValues(values: string[]) {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return Array.from(counts)
    .sort(([aName, aCount], [bName, bCount]) => bCount - aCount || aName.localeCompare(bName))
    .map(([value]) => value);
}

function isUsefulTag(tagName: string) {
  return !["live music", "music", "event", "events"].includes(tagName.toLowerCase());
}

function isTonight(event: EventRecord) {
  return event.eventDate === formatDateKey(new Date());
}

function isThisWeekend(event: EventRecord) {
  const date = new Date(`${event.eventDate}T12:00:00`);
  const today = new Date();
  const daysUntil = Math.floor((date.getTime() - startOfDay(today).getTime()) / 86_400_000);
  const day = date.getDay();

  return daysUntil >= 0 && daysUntil <= 7 && (day === 5 || day === 6 || day === 0);
}

function formatDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function startOfDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}
