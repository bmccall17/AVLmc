"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { EventImage } from "@/components/EventImage";
import type { CommunityCounts } from "@/lib/community";
import type { DiscoveryScoresByEvent } from "@/lib/discovery";
import type {
  DiscoveryEventAction,
  DiscoveryPersonEventState,
  DiscoveryStateByEvent,
} from "@/lib/discovery-memory";
import type { EventRecord } from "@/lib/events";
import { formatDate } from "@/lib/format";

type SortMode = "best-bets" | "best-match" | "soonest" | "hottest" | "discussion" | "venue";
type QuickFilterId = "tonight" | "weekend" | "free" | "dance" | "jazz" | "rock" | "local" | "outdoor";
type CardAction = Extract<DiscoveryEventAction, "avlgo_click" | "fire" | "planning" | "remove">;

type EventBoardProps = {
  counts: Record<string, CommunityCounts | undefined>;
  discoveryScores: DiscoveryScoresByEvent;
  events: EventRecord[];
  hasTasteProfile: boolean;
  initialDiscoveryStates: DiscoveryStateByEvent;
  windowLabel: string;
};

type EventActionResponse = {
  counts?: CommunityCounts;
  error?: string;
  state?: DiscoveryPersonEventState;
};

export function EventBoard({
  counts,
  discoveryScores,
  events,
  hasTasteProfile,
  initialDiscoveryStates,
  windowLabel,
}: EventBoardProps) {
  const [query, setQuery] = useState("");
  const [venue, setVenue] = useState("all");
  const [tag, setTag] = useState("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilterId | "all">("all");
  const [sortMode, setSortMode] = useState<SortMode>(hasTasteProfile ? "best-match" : "best-bets");
  const [eventCounts, setEventCounts] = useState(counts);
  const [discoveryStates, setDiscoveryStates] = useState(initialDiscoveryStates);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const trackedImpressions = useRef(new Set<string>());
  const visibleEvents = useMemo(
    () => events.filter((event) => !discoveryStates[event.id]?.removed),
    [discoveryStates, events]
  );
  const rankedVenues = useMemo(() => rankValues(visibleEvents.map((event) => event.venueName)).slice(0, 8), [visibleEvents]);
  const allVenues = useMemo(() => Array.from(new Set(visibleEvents.map((event) => event.venueName))).sort(), [visibleEvents]);
  const rankedTags = useMemo(
    () => rankValues(visibleEvents.flatMap((event) => event.tags).filter(isUsefulTag)).slice(0, 10),
    [visibleEvents]
  );
  const allTags = useMemo(() => Array.from(new Set(visibleEvents.flatMap((event) => event.tags))).sort(), [visibleEvents]);

  useEffect(() => {
    if (!hasTasteProfile && sortMode === "best-match") {
      setSortMode("best-bets");
    }
  }, [hasTasteProfile, sortMode]);

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const activeQuickFilter = quickFilters.find((filter) => filter.id === quickFilter);

    return visibleEvents
      .filter((event) => matchesSearch(event, normalizedQuery))
      .filter((event) => (venue === "all" ? true : event.venueName === venue))
      .filter((event) => (tag === "all" ? true : event.tags.includes(tag)))
      .filter((event) => (activeQuickFilter ? activeQuickFilter.matches(event) : true))
      .sort((a, b) => compareEvents(a, b, eventCounts, discoveryScores, sortMode));
  }, [discoveryScores, eventCounts, query, quickFilter, sortMode, tag, venue, visibleEvents]);

  function clearFilters() {
    setQuery("");
    setVenue("all");
    setTag("all");
    setQuickFilter("all");
    setSortMode(hasTasteProfile ? "best-match" : "best-bets");
  }

  useEffect(() => {
    for (const event of filteredEvents.slice(0, 12)) {
      if (trackedImpressions.current.has(event.id)) {
        continue;
      }

      trackedImpressions.current.add(event.id);
      void fetch("/api/discovery/event-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "impression",
          eventId: event.id,
          surface: `homepage:${sortMode}:${quickFilter}`,
        }),
      }).catch(() => undefined);
    }
  }, [filteredEvents, quickFilter, sortMode]);

  async function recordCardAction(event: EventRecord, action: CardAction) {
    const pendingKey = `${event.id}:${action}`;
    setPendingAction(pendingKey);

    try {
      const response = await fetch("/api/discovery/event-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          eventId: event.id,
          surface: "homepage",
        }),
      });
      const data = (await response.json()) as EventActionResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Could not save discovery action.");
      }

      if (data.counts) {
        setEventCounts((current) => ({
          ...current,
          [event.id]: data.counts,
        }));
      }
      if (data.state) {
        setDiscoveryStates((current) => ({
          ...current,
          [event.id]: data.state,
        }));
      }
    } catch {
      // Keep cards stable if a background learning request fails.
    } finally {
      setPendingAction(null);
    }
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
            const countsForEvent = eventCounts[event.id];
            const state = discoveryStates[event.id];
            const spotifySaves = countsForEvent?.goingSources.spotify ?? 0;
            const ticketClicks = countsForEvent?.goingSources.ticket_click ?? 0;

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
                    <span>{countsForEvent?.going ?? 0} planning</span>
                    <span>{countsForEvent?.notes ?? 0} notes</span>
                    <span>{countsForEvent?.songs ?? 0} songs</span>
                    <span>{countsForEvent?.fire ?? 0} fire</span>
                  </div>
                  {spotifySaves > 0 || ticketClicks > 0 ? (
                    <div className="intent-mini-row" aria-label="Saved signal sources">
                      {spotifySaves > 0 ? <span className="spotify-source">Spotify {spotifySaves}</span> : null}
                      {ticketClicks > 0 ? <span>Tickets {ticketClicks}</span> : null}
                    </div>
                  ) : null}
                  <div className="card-learning-actions" aria-label="Personal discovery actions">
                    <button
                      aria-pressed={state?.planning ?? false}
                      className={`learning-action planning ${state?.planning ? "is-active" : ""}`}
                      disabled={pendingAction === `${event.id}:planning`}
                      onClick={() => recordCardAction(event, "planning")}
                      type="button"
                    >
                      <span>I&apos;m planning to go</span>
                      <strong>{countsForEvent?.going ?? 0}</strong>
                    </button>
                    <button
                      aria-pressed={state?.fire ?? false}
                      className={`learning-action fire ${state?.fire ? "is-active" : ""}`}
                      disabled={pendingAction === `${event.id}:fire`}
                      onClick={() => recordCardAction(event, "fire")}
                      type="button"
                    >
                      <span>Fire</span>
                      <strong>{countsForEvent?.fire ?? 0}</strong>
                    </button>
                    <button
                      className="learning-action remove"
                      disabled={pendingAction === `${event.id}:remove`}
                      onClick={() => recordCardAction(event, "remove")}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="card-actions">
                    <Link href={`/event/${event.id}`}>View details</Link>
                    <a
                      href={event.eventUrl}
                      onClick={() => {
                        void recordCardAction(event, "avlgo_click");
                      }}
                      target="_blank"
                    >
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
