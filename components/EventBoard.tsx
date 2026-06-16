"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { Bell, CalendarCheck, ChevronRight, ExternalLink, Flame, Headphones, Search, Star, UserPlus, X } from "lucide-react";
import { SaveButton } from "@/components/SaveButton";
import { resolveGenres, type CanonicalGenre } from "@/lib/genre-taxonomy";
import type { CommunityCounts } from "@/lib/community";
import { scoreDiscoveryEvents, type DiscoveryReason, type DiscoveryScore, type DiscoveryScoresByEvent } from "@/lib/discovery";
import type {
  DiscoveryEventAction,
  DiscoveryPersonEventState,
  DiscoveryPreferenceSignal,
  DiscoveryStateByEvent,
  SpotifyMatchCorrection,
} from "@/lib/discovery-memory";
import type { EventRecord } from "@/lib/events";
import {
  LISTENER_PREFERENCE_CHANGE_EVENT,
  LISTENER_PREFERENCE_STORAGE_KEY,
  normalizeListenerPreferences,
  type ListenerDiscoveryPreferences,
} from "@/lib/listener-preferences";
import type { MusicConnection, MusicProfileItem } from "@/lib/music";

type SortMode = "best-bets" | "best-match" | "soonest" | "hottest" | "discussion" | "venue";
type QuickFilterId = "tonight" | "weekend" | "free" | "dance" | "rock" | "local" | "outdoor";
type QuickFilterCategory = "when" | "genre" | "vibe";
type QuickFilterSelections = Record<QuickFilterCategory, QuickFilterId | "all">;
type CardAction = Extract<DiscoveryEventAction, "avlgo_click" | "fire" | "planning" | "remove" | "unremove">;
type ActionKind = "fire" | "going" | "remove";

type ActiveTooltip = {
  action: ActionKind;
  eventId: string;
};

type EventBoardProps = {
  counts: Record<string, CommunityCounts | undefined>;
  discoveryScores: DiscoveryScoresByEvent;
  events: EventRecord[];
  hasTasteProfile: boolean;
  initialDiscoveryStates: DiscoveryStateByEvent;
  initialListenerPreferences: ListenerDiscoveryPreferences;
  initialSavedEventKeys: string[];
  isSignedIn: boolean;
  musicConnections: MusicConnection[];
  musicProfileItems: MusicProfileItem[];
  preferenceSignals: DiscoveryPreferenceSignal[];
  spotifyMatchCorrections: SpotifyMatchCorrection[];
  top30EventIds: string[];
  top30SourceUrl: string;
  windowLabel: string;
};

type EventActionResponse = {
  counts?: CommunityCounts;
  error?: string;
  state?: DiscoveryPersonEventState;
};

type SpotifyArtistSearchResult = {
  externalUrl: string;
  imageUrl: string | null;
  name: string;
  provider: "spotify";
  providerItemId: string;
};

type SpotifyMatchCorrectionResponse = {
  correction?: {
    action: "reject" | "replace";
    eventId: string;
    matchedTerm: string;
    normalizedTerm: string;
    replacementImageUrl: string | null;
    replacementName: string | null;
    replacementProviderItemId: string | null;
    replacementUrl: string | null;
  } | null;
  error?: string;
};

const TOOLTIP_DELAY_MS = 1500;
const SKIP_REMOVE_CONFIRM_KEY = "avlmc:homepage:skip-remove-confirm";
const RYAN_PLAYLIST_URL = "https://open.spotify.com/playlist/4fcdaCe97lEeEMe8rOhuSM?si=BcTWAtvxQqu3kRlZDlIuBQ";

const actionHelp: Record<ActionKind, { body: string; impact: string; title: string }> = {
  going: {
    body:
      "Adds this show to your intent list and teaches personal discovery to favor similar artists, venues, timing, and tags.",
    impact:
      "Also raises the public planning count, so other listeners can see that the show has momentum.",
    title: "Planning to go",
  },
  fire: {
    body:
      "A stronger positive signal than Going. Use it when a show feels especially relevant, even if you are not committing.",
    impact: "Adds heat to the community signal and can lift the show in social discovery rows.",
    title: "Fire",
  },
  remove: {
    body:
      "Hides this event from your list and sends a negative taste signal so similar picks show up less often for you.",
    impact:
      "Aggregate dismissals can help reduce weak recommendations for everyone without exposing who dismissed it.",
    title: "Remove",
  },
};

export function EventBoard({
  counts,
  discoveryScores,
  events,
  hasTasteProfile,
  initialDiscoveryStates,
  initialListenerPreferences,
  initialSavedEventKeys,
  isSignedIn,
  musicConnections,
  musicProfileItems,
  preferenceSignals,
  spotifyMatchCorrections,
  top30EventIds,
  top30SourceUrl,
  windowLabel,
}: EventBoardProps) {
  const [query, setQuery] = useState("");
  const [selectedVenues, setSelectedVenues] = useState<string[]>([]);
  const [venueQuery, setVenueQuery] = useState("");
  const [tag, setTag] = useState("all");
  const [tagQuery, setTagQuery] = useState("");
  const [quickFiltersByCategory, setQuickFiltersByCategory] = useState<QuickFilterSelections>(
    getDefaultQuickFilters
  );
  const [sortMode, setSortMode] = useState<SortMode>(hasTasteProfile ? "best-match" : "best-bets");
  const [eventCounts, setEventCounts] = useState(counts);
  const [eventScores, setEventScores] = useState(discoveryScores);
  const [listenerPreferences, setListenerPreferences] = useState(() =>
    normalizeListenerPreferences(initialListenerPreferences)
  );
  const [localPreferenceSignals, setLocalPreferenceSignals] = useState(preferenceSignals);
  const [discoveryStates, setDiscoveryStates] = useState(initialDiscoveryStates);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [activeTooltip, setActiveTooltip] = useState<ActiveTooltip | null>(null);
  const [confirmEvent, setConfirmEvent] = useState<EventRecord | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [revealedEventId, setRevealedEventId] = useState<string | null>(events[0]?.id ?? null);
  const [skipConfirm, setSkipConfirm] = useState(false);
  const [skipFutureConfirm, setSkipFutureConfirm] = useState(false);
  const top30EventIdSet = useMemo(() => new Set(top30EventIds), [top30EventIds]);
  const savedEventKeySet = useMemo(() => new Set(initialSavedEventKeys), [initialSavedEventKeys]);
  const [toastEvent, setToastEvent] = useState<EventRecord | null>(null);
  const tooltipTimer = useRef<number | null>(null);
  const trackedImpressions = useRef(new Set<string>());
  const visibleEvents = useMemo(
    () => events.filter((event) => !discoveryStates[event.id]?.removed),
    [discoveryStates, events]
  );
  const allVenues = useMemo(() => Array.from(new Set(visibleEvents.map((event) => event.venueName))).sort(), [visibleEvents]);
  const allTags = useMemo(
    () => Array.from(new Set(visibleEvents.flatMap((event) => event.tags).filter(isUsefulTag))).sort(),
    [visibleEvents]
  );
  const activeQuickFilters = useMemo(
    () =>
      quickFilterGroups.flatMap((group) => {
        const activeId = quickFiltersByCategory[group.id];

        if (activeId === "all") {
          return [];
        }

        const filter = group.filters.find((item) => item.id === activeId);
        return filter ? [filter] : [];
      }),
    [quickFiltersByCategory]
  );
  const defaultSortMode = hasTasteProfile ? "best-match" : "best-bets";
  const activeFilterSurface = activeQuickFilters.map((filter) => filter.id).join("+") || "all";
  const hasActiveFilters =
    query.trim().length > 0 ||
    selectedVenues.length > 0 ||
    tag !== "all" ||
    activeQuickFilters.length > 0 ||
    sortMode !== defaultSortMode;

  useEffect(() => {
    if (!hasTasteProfile && sortMode === "best-match") {
      setSortMode("best-bets");
    }
  }, [hasTasteProfile, sortMode]);

  useEffect(() => {
    function applyPreferences(value: unknown) {
      setListenerPreferences(normalizeListenerPreferences(value));
    }

    if (!isSignedIn) {
      const storedPreferences = window.localStorage.getItem(LISTENER_PREFERENCE_STORAGE_KEY);

      if (storedPreferences) {
        try {
          applyPreferences(JSON.parse(storedPreferences));
        } catch {
          window.localStorage.removeItem(LISTENER_PREFERENCE_STORAGE_KEY);
        }
      }
    }

    function handlePreferenceChange(event: Event) {
      const detail = (event as CustomEvent<{ preferences?: unknown }>).detail;

      if (detail?.preferences) {
        applyPreferences(detail.preferences);
      }
    }

    window.addEventListener(LISTENER_PREFERENCE_CHANGE_EVENT, handlePreferenceChange);

    return () => {
      window.removeEventListener(LISTENER_PREFERENCE_CHANGE_EVENT, handlePreferenceChange);
    };
  }, [isSignedIn]);

  useEffect(() => {
    setEventScores(
      scoreDiscoveryEvents({
        connections: musicConnections,
        counts: eventCounts,
        events,
        listenerPreferences,
        preferenceSignals: localPreferenceSignals,
        profileItems: musicProfileItems,
        spotifyMatchCorrections,
      })
    );
  }, [
    eventCounts,
    events,
    listenerPreferences,
    localPreferenceSignals,
    musicConnections,
    musicProfileItems,
    spotifyMatchCorrections,
  ]);

  useEffect(() => {
    setSkipConfirm(window.localStorage.getItem(SKIP_REMOVE_CONFIRM_KEY) === "true");

    return () => {
      clearTooltipTimer();
    };
  }, []);

  useEffect(() => {
    setRevealedEventId((current) =>
      current && visibleEvents.some((event) => event.id === current)
        ? current
        : visibleEvents[0]?.id ?? null
    );
  }, [visibleEvents]);

  const filteredEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return visibleEvents
      .filter((event) => matchesSearch(event, normalizedQuery))
      .filter((event) => (selectedVenues.length === 0 ? true : selectedVenues.includes(event.venueName)))
      .filter((event) => (tag === "all" ? true : event.tags.includes(tag)))
      .filter((event) => activeQuickFilters.every((filter) => filter.matches(event)))
      .sort((a, b) => compareEvents(a, b, eventCounts, eventScores, sortMode));
  }, [activeQuickFilters, eventCounts, eventScores, query, selectedVenues, sortMode, tag, visibleEvents]);

  function clearFilters() {
    setQuery("");
    setSelectedVenues([]);
    setVenueQuery("");
    setTag("all");
    setTagQuery("");
    setQuickFiltersByCategory(getDefaultQuickFilters());
    setSortMode(defaultSortMode);
  }

  function toggleQuickFilter(category: QuickFilterCategory, filterId: QuickFilterId) {
    setQuickFiltersByCategory((current) => ({
      ...current,
      [category]: current[category] === filterId ? "all" : filterId,
    }));
  }

  function addVenueFilter(value: string) {
    const venueName = findExactOption(allVenues, value);

    if (!venueName) {
      return;
    }

    setSelectedVenues((current) => (current.includes(venueName) ? current : [...current, venueName]));
    setVenueQuery("");
  }

  function removeVenueFilter(venueName: string) {
    setSelectedVenues((current) => current.filter((item) => item !== venueName));
  }

  function addTagFilter(value: string) {
    const tagName = findExactOption(allTags, value);

    if (!tagName) {
      return;
    }

    setTag(tagName);
    setTagQuery("");
  }

  function removeTagFilter() {
    setTag("all");
    setTagQuery("");
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
          surface: `homepage:${sortMode}:${activeFilterSurface}`,
        }),
      }).catch(() => undefined);
    }
  }, [activeFilterSurface, filteredEvents, sortMode]);

  function clearTooltipTimer() {
    if (tooltipTimer.current) {
      window.clearTimeout(tooltipTimer.current);
      tooltipTimer.current = null;
    }
  }

  function queueTooltip(eventId: string, action: ActionKind) {
    clearTooltipTimer();
    tooltipTimer.current = window.setTimeout(() => {
      setActiveTooltip({ action, eventId });
    }, TOOLTIP_DELAY_MS);
  }

  function clearTooltip() {
    clearTooltipTimer();
    setActiveTooltip(null);
  }

  async function recordCardAction(
    event: EventRecord,
    action: CardAction,
    options: { silent?: boolean; surface?: string } = {}
  ) {
    const pendingKey = `${event.id}:${action}`;

    if (!options.silent) {
      setPendingAction(pendingKey);
      setErrorMessage(null);
    }

    try {
      const response = await fetch("/api/discovery/event-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          eventId: event.id,
          surface: options.surface ?? "homepage",
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

      // Append a taste signal so the scoring engine re-ranks similar events immediately.
      if (action !== "avlgo_click") {
        setLocalPreferenceSignals((current) => [
          {
            action,
            artistName: event.artistName,
            eventId: event.id,
            eventTitle: event.eventTitle,
            tags: event.tags,
            venueName: event.venueName,
          },
          ...current,
        ]);
      }

      return data;
    } catch {
      if (!options.silent) {
        setErrorMessage("Could not save discovery action.");
      }
      return null;
    } finally {
      if (!options.silent) {
        setPendingAction(null);
      }
    }
  }

  async function togglePositiveAction(event: EventRecord, action: Extract<ActionKind, "fire" | "going">) {
    clearTooltip();
    setToastEvent(null);
    await recordCardAction(event, action === "going" ? "planning" : "fire");
  }

  async function trackAvlgoClick(event: EventRecord) {
    await recordCardAction(event, "avlgo_click", { silent: true, surface: "homepage:avlgo" });
  }

  async function requestRemove(event: EventRecord) {
    clearTooltip();

    if (skipConfirm) {
      const removed = await recordCardAction(event, "remove");

      if (removed) {
        setToastEvent(event);
      }
      return;
    }

    setSkipFutureConfirm(false);
    setConfirmEvent(event);
  }

  async function confirmRemove() {
    if (!confirmEvent) {
      return;
    }

    if (skipFutureConfirm) {
      window.localStorage.setItem(SKIP_REMOVE_CONFIRM_KEY, "true");
      setSkipConfirm(true);
    }

    const removed = await recordCardAction(confirmEvent, "remove");

    if (removed) {
      setToastEvent(confirmEvent);
      setConfirmEvent(null);
    }
  }

  async function undoRemove(event: EventRecord) {
    const restored = await recordCardAction(event, "unremove");

    if (restored) {
      setToastEvent(null);
      setRevealedEventId(event.id);
    }
  }

  function toggleReveal(eventId: string) {
    setRevealedEventId((current) => (current === eventId ? null : eventId));
  }

  return (
    <>
      <section className="sandbox-hero" id="for-you">
        <div className="sandbox-header">
          <p className="eyebrow">For You</p>
          <h1>Find the Asheville show worth talking about.</h1>
          <p className="lede">
            A rolling {windowLabel} live music board, ranked by your taste, local pulse, and curator signals.
          </p>
          <label className="sandbox-search">
            <Search aria-hidden="true" size={17} strokeWidth={2.4} />
            <input
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search venues, artists, signals"
              type="search"
              value={query}
            />
          </label>
        </div>

        <SocialDiscoveryBeats
          counts={eventCounts}
          events={filteredEvents.slice(0, 6)}
          scores={eventScores}
          top30EventIds={top30EventIdSet}
          top30SourceUrl={top30SourceUrl}
        />
      </section>

      <CuratorComingSoon />

      <section className="search-panel discovery-filter-panel" aria-label="Discovery controls">
        <div className="filter-panel-head">
          <div>
            <span className="filter-panel-kicker">Filters</span>
            <strong>
              {filteredEvents.length} of {visibleEvents.length} showing
            </strong>
          </div>
          {hasActiveFilters ? (
            <button className="filter-reset" onClick={clearFilters} type="button">
              <X aria-hidden="true" size={15} strokeWidth={2.6} />
              Reset
            </button>
          ) : null}
        </div>

        {quickFilterGroups.slice(0, 2).map((group) => (
          <div className="filter-section" key={group.id}>
            <span className="filter-section-label">{group.label}</span>
            <div className="filter-group" aria-label={`${group.label} filters`}>
              {group.filters.map((filter) => (
                <button
                  aria-pressed={quickFiltersByCategory[group.id] === filter.id}
                  className="filter-chip"
                  key={filter.id}
                  onClick={() => toggleQuickFilter(group.id, filter.id)}
                  type="button"
                >
                  {filter.label}
                </button>
              ))}
              {group.id === "genre" && tag !== "all" ? (
                <button
                  aria-label={`Remove ${tag} tag filter`}
                  aria-pressed="true"
                  className="filter-chip filter-chip-removable"
                  onClick={removeTagFilter}
                  type="button"
                >
                  {tag}
                  <X aria-hidden="true" size={14} strokeWidth={2.7} />
                </button>
              ) : null}
            </div>
          </div>
        ))}

        <div className="filter-section">
          <span className="filter-section-label">Venue</span>
          <div className="filter-group filter-group-search" aria-label="Venue filters">
            {selectedVenues.map((venueName) => (
              <button
                aria-label={`Remove ${venueName} venue filter`}
                aria-pressed="true"
                className="filter-chip filter-chip-removable"
                key={venueName}
                onClick={() => removeVenueFilter(venueName)}
                type="button"
              >
                {venueName}
                <X aria-hidden="true" size={14} strokeWidth={2.7} />
              </button>
            ))}
            <label className="filter-search-control">
              <Search aria-hidden="true" size={15} strokeWidth={2.5} />
              <input
                aria-label="Search venues"
                list="venue-filter-options"
                onChange={(event) => {
                  setVenueQuery(event.target.value);
                  addVenueFilter(event.target.value);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addVenueFilter(venueQuery);
                  }
                }}
                placeholder="Search venues"
                type="search"
                value={venueQuery}
              />
            </label>
            <datalist id="venue-filter-options">
              {allVenues.map((venueName) => (
                <option key={venueName} value={venueName} />
              ))}
            </datalist>
          </div>
        </div>

        <div className="filter-section">
          <span className="filter-section-label">Vibe</span>
          <div className="filter-group" aria-label="Vibe filters">
            {quickFilterGroups[2].filters.map((filter) => (
              <button
                aria-pressed={quickFiltersByCategory.vibe === filter.id}
                className="filter-chip"
                key={filter.id}
                onClick={() => toggleQuickFilter("vibe", filter.id)}
                type="button"
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <details className="filter-more">
          <summary>More filters</summary>
          <div className="filter-more-grid">
            <label className="filter-field">
              <span>Tag</span>
              <span className="filter-search-control">
                <Search aria-hidden="true" size={15} strokeWidth={2.5} />
                <input
                  aria-label="Search tags"
                  list="tag-filter-options"
                  onChange={(event) => {
                    setTagQuery(event.target.value);
                    addTagFilter(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addTagFilter(tagQuery);
                    }
                  }}
                  placeholder="Search tags"
                  type="search"
                  value={tagQuery}
                />
              </span>
            </label>
            <label className="filter-field">
              <span>Sort</span>
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
            </label>
            <datalist id="tag-filter-options">
              {allTags.map((tagName) => (
                <option key={tagName} value={tagName} />
              ))}
            </datalist>
          </div>
        </details>
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

      {errorMessage ? <p className="sandbox-error-message">{errorMessage}</p> : null}

      {filteredEvents.length === 0 ? (
        <section className="empty-state">
          <h2>No matching music events</h2>
          <p>Try clearing a filter or searching for a different artist, venue, or tag.</p>
        </section>
      ) : (
        <section className="sandbox-layout" id="cards" aria-label="Upcoming music events">
          {filteredEvents.map((event, index) => {
            const score = eventScores[event.id];
            const reasons = score?.reasons ?? [];
            const countsForEvent = eventCounts[event.id];
            const state = discoveryStates[event.id];

            return (
              <DiscoveryEventCard
                activeTooltip={activeTooltip}
                counts={countsForEvent}
                event={event}
                index={index}
                isPending={pendingAction?.startsWith(`${event.id}:`) ?? false}
                isRevealed={revealedEventId === event.id}
                isSaved={savedEventKeySet.has(event.id)}
                isSignedIn={isSignedIn}
                isTop30={top30EventIdSet.has(event.id)}
                key={event.id}
                onClearTooltip={clearTooltip}
                onQueueTooltip={queueTooltip}
                onRemove={requestRemove}
                onReveal={toggleReveal}
                onScoreChange={(updatedScore) => {
                  setEventScores((current) => ({
                    ...current,
                    [event.id]: updatedScore,
                  }));
                }}
                onTogglePositiveAction={togglePositiveAction}
                onTrackAvlgoClick={trackAvlgoClick}
                reasons={reasons}
                score={score}
                state={state}
              />
            );
          })}
        </section>
      )}

      {confirmEvent ? (
        <RemoveConfirmationDialog
          event={confirmEvent}
          onCancel={() => setConfirmEvent(null)}
          onConfirm={confirmRemove}
          onSkipFutureChange={setSkipFutureConfirm}
          skipFuture={skipFutureConfirm}
        />
      ) : null}

      {toastEvent ? (
        <div className="sandbox-toast" role="status">
          <span>
            Removed <strong>{toastEvent.eventTitle}</strong>. Similar signals will rank lower for you.
          </span>
          <button onClick={() => void undoRemove(toastEvent)} type="button">
            Undo
          </button>
        </div>
      ) : null}
    </>
  );
}

function DiscoveryEventCard({
  activeTooltip,
  counts,
  event,
  index,
  isPending,
  isRevealed,
  isSaved,
  isSignedIn,
  isTop30,
  onClearTooltip,
  onQueueTooltip,
  onRemove,
  onReveal,
  onScoreChange,
  onTogglePositiveAction,
  onTrackAvlgoClick,
  reasons,
  score,
  state,
}: {
  activeTooltip: ActiveTooltip | null;
  counts: CommunityCounts | undefined;
  event: EventRecord;
  index: number;
  isPending: boolean;
  isRevealed: boolean;
  isSaved: boolean;
  isSignedIn: boolean;
  isTop30: boolean;
  onClearTooltip: () => void;
  onQueueTooltip: (eventId: string, action: ActionKind) => void;
  onRemove: (event: EventRecord) => void;
  onReveal: (eventId: string) => void;
  onScoreChange: (score: DiscoveryScore) => void;
  onTogglePositiveAction: (event: EventRecord, action: Extract<ActionKind, "fire" | "going">) => void;
  onTrackAvlgoClick: (event: EventRecord) => void;
  reasons: DiscoveryReason[];
  score: DiscoveryScore | undefined;
  state: DiscoveryPersonEventState | undefined;
}) {
  const date = parseEventDate(event);
  const tag = getPrimaryTag(event);
  const match = formatMatchScore(score, index);
  const fire = counts?.fire ?? 0;
  const going = counts?.going ?? 0;
  const songs = counts?.songs ?? 0;
  const spotifySaves = counts?.goingSources.spotify ?? 0;
  const ticketClicks = counts?.goingSources.ticket_click ?? 0;

  function handleCardClick(eventClick: MouseEvent<HTMLElement>) {
    if (isInteractiveTarget(eventClick.target)) {
      return;
    }

    onReveal(event.id);
  }

  function handleCardKeyDown(keyEvent: KeyboardEvent<HTMLElement>) {
    if (keyEvent.key !== "Enter" && keyEvent.key !== " ") {
      return;
    }

    if (isInteractiveTarget(keyEvent.target)) {
      return;
    }

    keyEvent.preventDefault();
    onReveal(event.id);
  }

  return (
    <article
      className={`sandbox-event-card fresh-card ${isRevealed ? "is-revealed" : ""}`}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      tabIndex={0}
    >
      <EventPoster event={event} />

      <div className="sandbox-card-top">
        <div className="sandbox-card-tags">
          <span className="sandbox-card-tag">{tag}</span>
          {isTop30 ? (
            <span className="sandbox-top30-badge">
              <Star aria-hidden="true" size={12} strokeWidth={2.6} />
              Top 30
            </span>
          ) : null}
        </div>
        <strong className="sandbox-match-pill">{match}% match</strong>
      </div>

      <div className="sandbox-card-body">
        <div className="sandbox-date">
          <span>{formatWeekday(date)}</span>
          <strong>{formatMonthDay(date)}</strong>
        </div>
        <p className="card-kicker">{event.venueName}</p>
        <h3>{event.eventTitle}</h3>
        <p className="event-meta">
          {event.eventTime ?? "Time TBA"} · {event.artistName}
        </p>
        <div className="sandbox-pulse" aria-label="Social pulse">
          <span className="avatar-stack" aria-hidden="true">
            <i>M</i>
            <i>J</i>
            <i>R</i>
          </span>
          <span>
            {going} planning · {songs} songs · {fire} fire
          </span>
        </div>
        <div className="sandbox-card-disclosure">
          <p className="sandbox-note">{buildNote({ counts, event, isTop30, score, tag })}</p>
          {reasons.length > 0 ? (
            <div className="reason-row card-reason-row" aria-label="Recommendation reasons">
              {reasons.map((reason) => (
                <ReasonBadge
                  event={event}
                  key={getReasonKey(reason)}
                  onScoreChange={onScoreChange}
                  reason={reason}
                  score={score}
                />
              ))}
            </div>
          ) : null}
          {spotifySaves > 0 || ticketClicks > 0 ? (
            <div className="intent-mini-row card-intent-row" aria-label="Saved signal sources">
              {spotifySaves > 0 ? <span className="spotify-source">Spotify {spotifySaves}</span> : null}
              {ticketClicks > 0 ? <span>AVLgo {ticketClicks}</span> : null}
            </div>
          ) : null}
          <div className="sandbox-card-links" aria-label="Event links">
            <Link href={`/event/${event.id}`}>Details</Link>
            <a
              href={event.eventUrl}
              onClick={() => {
                void onTrackAvlgoClick(event);
              }}
              target="_blank"
            >
              AVLgo <ExternalLink aria-hidden="true" size={13} strokeWidth={2.4} />
            </a>
          </div>
        </div>
      </div>

      <div className="sandbox-action-bar" aria-label="Discovery actions">
        <ActionButton
          action="going"
          activeTooltip={activeTooltip}
          ariaLabel={`Planning to go: ${going}`}
          eventId={event.id}
          isDisabled={isPending}
          isPressed={state?.planning ?? false}
          onClearTooltip={onClearTooltip}
          onClick={() => onTogglePositiveAction(event, "going")}
          onQueueTooltip={onQueueTooltip}
        >
          <CalendarCheck aria-hidden="true" size={16} strokeWidth={2.5} />
          <span>Going</span>
          <strong>{going}</strong>
        </ActionButton>
        <ActionButton
          action="fire"
          activeTooltip={activeTooltip}
          ariaLabel={`Fire: ${fire}`}
          eventId={event.id}
          isDisabled={isPending}
          isPressed={state?.fire ?? false}
          onClearTooltip={onClearTooltip}
          onClick={() => onTogglePositiveAction(event, "fire")}
          onQueueTooltip={onQueueTooltip}
        >
          <Flame aria-hidden="true" size={16} strokeWidth={2.5} />
          <span>Fire</span>
          <strong>{fire}</strong>
        </ActionButton>
        <ActionButton
          action="remove"
          activeTooltip={activeTooltip}
          ariaLabel="Remove from my discovery"
          eventId={event.id}
          isDisabled={isPending}
          isPressed={false}
          onClearTooltip={onClearTooltip}
          onClick={() => onRemove(event)}
          onQueueTooltip={onQueueTooltip}
        >
          <X aria-hidden="true" size={18} strokeWidth={2.6} />
        </ActionButton>
        <SaveButton
          eventId={event.id}
          initialSaved={isSaved}
          isSignedIn={isSignedIn}
          itemKey={event.id}
          itemType="event"
          label={event.eventTitle}
        />
      </div>
    </article>
  );
}

function EventPoster({ event }: { event: EventRecord }) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(event.imageUrl && !failed);

  return (
    <div className={`sandbox-art ${showImage ? "has-image" : "is-fallback"}`} aria-hidden="true">
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          decoding="async"
          loading="lazy"
          onError={() => setFailed(true)}
          src={event.imageUrl ?? undefined}
        />
      ) : null}
      <span>{getInitials(event.artistName || event.eventTitle)}</span>
    </div>
  );
}

function ActionButton({
  action,
  activeTooltip,
  ariaLabel,
  children,
  eventId,
  isDisabled,
  isPressed,
  onClearTooltip,
  onClick,
  onQueueTooltip,
}: {
  action: ActionKind;
  activeTooltip: ActiveTooltip | null;
  ariaLabel: string;
  children: ReactNode;
  eventId: string;
  isDisabled: boolean;
  isPressed: boolean;
  onClearTooltip: () => void;
  onClick: () => void;
  onQueueTooltip: (eventId: string, action: ActionKind) => void;
}) {
  const tooltipId = `event-${eventId}-${action}-tooltip`;
  const isTooltipActive = activeTooltip?.eventId === eventId && activeTooltip.action === action;

  return (
    <button
      aria-describedby={isTooltipActive ? tooltipId : undefined}
      aria-label={ariaLabel}
      aria-pressed={isPressed}
      className={`is-${action}`}
      disabled={isDisabled}
      onBlur={onClearTooltip}
      onClick={onClick}
      onFocus={() => onQueueTooltip(eventId, action)}
      onMouseEnter={() => onQueueTooltip(eventId, action)}
      onMouseLeave={onClearTooltip}
      type="button"
    >
      {children}
      {isTooltipActive ? <ActionTooltip action={action} id={tooltipId} /> : null}
    </button>
  );
}

function ActionTooltip({ action, id }: { action: ActionKind; id: string }) {
  const help = actionHelp[action];

  return (
    <span className="sandbox-action-tooltip" id={id} role="tooltip">
      <strong>{help.title}</strong>
      <span>{help.body}</span>
      <em>{help.impact}</em>
    </span>
  );
}

function RemoveConfirmationDialog({
  event,
  onCancel,
  onConfirm,
  onSkipFutureChange,
  skipFuture,
}: {
  event: EventRecord;
  onCancel: () => void;
  onConfirm: () => void;
  onSkipFutureChange: (value: boolean) => void;
  skipFuture: boolean;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const firstButton = dialogRef.current?.querySelector<HTMLButtonElement>("button");
    firstButton?.focus();
  }, []);

  function handleKeyDown(keyEvent: KeyboardEvent<HTMLElement>) {
    if (keyEvent.key === "Escape") {
      onCancel();
      return;
    }

    if (keyEvent.key !== "Tab") {
      return;
    }

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"
      ) ?? []
    );

    if (focusable.length === 0) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (keyEvent.shiftKey && document.activeElement === first) {
      keyEvent.preventDefault();
      last.focus();
      return;
    }

    if (!keyEvent.shiftKey && document.activeElement === last) {
      keyEvent.preventDefault();
      first.focus();
    }
  }

  return (
    <div
      className="sandbox-dialog-backdrop"
      onMouseDown={(mouseEvent) => {
        if (mouseEvent.target === mouseEvent.currentTarget) {
          onCancel();
        }
      }}
    >
      <section
        aria-labelledby="homepage-remove-title"
        aria-modal="true"
        className="sandbox-remove-dialog"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <p className="eyebrow">Remove signal</p>
        <h2 id="homepage-remove-title">Remove this event from your discovery?</h2>
        <p>
          <strong>{event.eventTitle}</strong> will hide from this surface. The personal discovery
          algorithm treats Remove as a negative signal for similar artists, venues, tags, and timing.
        </p>
        <p>
          This does not publicly shame the event. In aggregate, dismissals can help keep weak matches
          from rising for other listeners.
        </p>
        <label className="sandbox-confirm-checkbox">
          <input
            checked={skipFuture}
            onChange={(changeEvent) => onSkipFutureChange(changeEvent.target.checked)}
            type="checkbox"
          />
          <span>Don&apos;t show me this again</span>
        </label>
        <div className="sandbox-dialog-actions">
          <button className="secondary" onClick={onCancel} type="button">
            Keep event
          </button>
          <button className="danger" onClick={onConfirm} type="button">
            Remove
          </button>
        </div>
      </section>
    </div>
  );
}

function SocialDiscoveryBeats({
  counts,
  events,
  scores,
  top30EventIds,
  top30SourceUrl,
}: {
  counts: EventBoardProps["counts"];
  events: EventRecord[];
  scores: DiscoveryScoresByEvent;
  top30EventIds: Set<string>;
  top30SourceUrl: string;
}) {
  const top30Count = events.filter((event) => top30EventIds.has(event.id)).length;

  return (
    <aside className="sandbox-beats" id="local-pulse" aria-label="Local Pulse">
      <div className="sandbox-beats-header">
        <span className="sandbox-beats-title">
          <Headphones aria-hidden="true" size={15} strokeWidth={2.4} />
          <p className="eyebrow">Local Pulse</p>
        </span>
        <strong>{top30Count > 0 ? `${top30Count} Top 30` : `${events.length} live rows`}</strong>
      </div>
      <div className="local-pulse-source-row">
        <a href={top30SourceUrl} rel="noreferrer" target="_blank">
          <Star aria-hidden="true" size={13} strokeWidth={2.6} />
          AVLgo Top 30 seed
        </a>
        <span>Community planning, fire, songs, and notes keep this moving.</span>
      </div>
      <div className="sandbox-beat-list">
        {events.map((event, index) => {
          const eventCounts = counts[event.id];
          const date = parseEventDate(event);
          const isTop30 = top30EventIds.has(event.id);

          return (
            <Link className="sandbox-beat-tile" href={`/event/${event.id}`} key={event.id}>
              <span className={`sandbox-beat-thumb ${event.imageUrl ? "" : "is-fallback"}`} aria-hidden="true">
                {event.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt="" decoding="async" loading="lazy" src={event.imageUrl} />
                ) : null}
                <i>{getInitials(event.artistName || event.eventTitle)}</i>
                <em>{isTop30 ? "TOP 30" : index === 0 || (eventCounts?.fire ?? 0) > 0 ? "HOT" : "NEW"}</em>
              </span>
              <span className="sandbox-beat-copy">
                <strong>{event.eventTitle}</strong>
                <small>
                  {formatWeekday(date)} {formatMonthDay(date)} · {event.venueName}
                </small>
                <span>
                  {isTop30 ? (
                    <i className="local-pulse-inline-badge">
                      <Star aria-hidden="true" size={10} strokeWidth={2.8} />
                      Top 30
                    </i>
                  ) : null}
                  {formatMatchScore(scores[event.id], index)}% match · {eventCounts?.going ?? 0} planning ·{" "}
                  {eventCounts?.fire ?? 0} fire
                </span>
              </span>
              <ChevronRight aria-hidden="true" size={16} strokeWidth={2.4} />
            </Link>
          );
        })}
      </div>
    </aside>
  );
}

function CuratorComingSoon() {
  const signupHref =
    "mailto:?subject=AVLmc%20curator%20signup&body=I%27d%20like%20to%20be%20considered%20as%20an%20AVLmc%20curator.%0A%0AName%3A%0AMusic%20lane%3A%0ALinks%3A";
  const recommendHref =
    "mailto:?subject=AVLmc%20curator%20recommendation&body=I%27d%20like%20to%20recommend%20a%20curator%20for%20AVLmc.%0A%0AName%3A%0ALinks%3A%0AWhy%20they%20matter%3A";

  return (
    <section className="curator-callout" id="curators" aria-label="Curators coming soon">
      <div className="curator-callout-copy">
        <span className="curator-status">
          <Bell aria-hidden="true" size={14} strokeWidth={2.6} />
          Coming soon
        </span>
        <h2>Curators</h2>
        <p>
          Follow local tastemakers, friends, and music circles so their show signals can carry more weight in your discovery feed.
        </p>
      </div>
      <div className="curator-actions">
        <a className="curator-action is-playlist" href={RYAN_PLAYLIST_URL} rel="noreferrer" target="_blank">
          Ryan&apos;s playlist
          <ExternalLink aria-hidden="true" size={13} strokeWidth={2.4} />
        </a>
        <a className="curator-action" href={signupHref}>
          <UserPlus aria-hidden="true" size={14} strokeWidth={2.6} />
          Sign up
        </a>
        <a className="curator-action" href={recommendHref}>
          Recommend a curator
        </a>
      </div>
    </section>
  );
}

function buildNote({
  counts,
  event,
  isTop30,
  score,
  tag,
}: {
  counts: CommunityCounts | undefined;
  event: EventRecord;
  isTop30: boolean;
  score: DiscoveryScore | undefined;
  tag: string;
}) {
  const reason = score?.reasons[0]?.label ?? `${tag.toLowerCase()} signal`;
  const notes = counts?.notes ?? 0;
  const songs = counts?.songs ?? 0;

  if (isTop30) {
    return `AVLgo Top 30 seed: ${event.artistName} is also showing up in AVLgo's popularity list.`;
  }

  if (notes > 0 || songs > 0) {
    return `${reason}: ${notes} notes and ${songs} songs are already attached to this listing.`;
  }

  return `${reason}: ${event.artistName} at ${event.venueName} is inside the current live music window.`;
}

function formatMatchScore(score: DiscoveryScore | undefined, index: number) {
  const rawScore = score?.bestMatchScore ?? score?.bestBetsScore ?? 0;
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

function isInteractiveTarget(target: EventTarget) {
  return target instanceof Element && Boolean(target.closest("a, button, input, label"));
}

function ReasonBadge({
  event,
  onScoreChange,
  reason,
  score,
}: {
  event: EventRecord;
  onScoreChange: (score: DiscoveryScore) => void;
  reason: DiscoveryReason;
  score: DiscoveryScore | undefined;
}) {
  if (reason.kind !== "spotify_artist") {
    return <span>{reason.label}</span>;
  }

  return (
    <SpotifyMatchBadge
      event={event}
      onScoreChange={onScoreChange}
      reason={reason}
      score={score}
    />
  );
}

function SpotifyMatchBadge({
  event,
  onScoreChange,
  reason,
  score,
}: {
  event: EventRecord;
  onScoreChange: (score: DiscoveryScore) => void;
  reason: Extract<DiscoveryReason, { kind: "spotify_artist" }>;
  score: DiscoveryScore | undefined;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState(reason.detail.matchedTerm);
  const [artists, setArtists] = useState<SpotifyArtistSearchResult[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function rejectMatch() {
    setPending("reject");
    setMessage(null);

    try {
      const response = await fetch("/api/discovery/spotify-match-correction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reject",
          eventId: event.id,
          matchedTerm: reason.detail.matchedTerm,
          normalizedTerm: reason.detail.normalizedTerm,
        }),
      });
      const data = (await response.json()) as SpotifyMatchCorrectionResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Could not remove Spotify match.");
      }

      if (score) {
        onScoreChange(removeSpotifyReason(score, reason));
      }
      setIsOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not remove Spotify match.");
    } finally {
      setPending(null);
    }
  }

  async function searchArtists() {
    const normalizedQuery = query.trim();

    if (normalizedQuery.length < 2) {
      setArtists([]);
      return;
    }

    setPending("search");
    setMessage(null);

    try {
      const response = await fetch(`/api/me/spotify-artists?q=${encodeURIComponent(normalizedQuery)}`);
      const data = (await response.json()) as { artists?: SpotifyArtistSearchResult[]; error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not search Spotify artists.");
      }

      setArtists(data.artists ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not search Spotify artists.");
    } finally {
      setPending(null);
    }
  }

  async function replaceMatch(artist: SpotifyArtistSearchResult) {
    setPending(artist.providerItemId);
    setMessage(null);

    try {
      const response = await fetch("/api/discovery/spotify-match-correction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "replace",
          eventId: event.id,
          matchedTerm: reason.detail.matchedTerm,
          normalizedTerm: reason.detail.normalizedTerm,
          replacement: artist,
        }),
      });
      const data = (await response.json()) as SpotifyMatchCorrectionResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Could not correct Spotify match.");
      }

      if (score) {
        onScoreChange(replaceSpotifyReason(score, reason, artist));
      }
      setIsOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not correct Spotify match.");
    } finally {
      setPending(null);
    }
  }

  return (
    <span className="spotify-match-wrap" onMouseLeave={() => setIsOpen(false)}>
      <button
        aria-expanded={isOpen}
        className="reason-badge-button spotify-match-button"
        onBlur={(event) => {
          if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) {
            setIsOpen(false);
          }
        }}
        onClick={() => setIsOpen((current) => !current)}
        onFocus={() => setIsOpen(true)}
        onMouseEnter={() => setIsOpen(true)}
        type="button"
      >
        {reason.label}
      </button>
      {isOpen ? (
        <span
          className="spotify-match-popover"
          onBlur={(event) => {
            if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node | null)) {
              setIsOpen(false);
            }
          }}
        >
          <strong>{reason.label}</strong>
          <span>{formatSpotifyMatchExplanation(reason)}</span>
          <span className="spotify-match-actions">
            <button disabled={Boolean(pending)} onClick={rejectMatch} type="button">
              Remove match
            </button>
          </span>
          <span className="spotify-artist-search">
            <input
              aria-label="Search Spotify artists"
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void searchArtists();
                }
              }}
              placeholder="Correct artist"
              type="search"
              value={query}
            />
            <button disabled={pending === "search"} onClick={searchArtists} type="button">
              Search
            </button>
          </span>
          {artists.length > 0 ? (
            <span className="spotify-artist-results">
              {artists.map((artist) => (
                <button
                  disabled={Boolean(pending)}
                  key={artist.providerItemId}
                  onClick={() => replaceMatch(artist)}
                  type="button"
                >
                  {artist.name}
                </button>
              ))}
            </span>
          ) : null}
          {message ? <span className="spotify-match-message">{message}</span> : null}
        </span>
      ) : null}
    </span>
  );
}

function getReasonKey(reason: DiscoveryReason) {
  return reason.kind === "spotify_artist" ? `${reason.kind}:${reason.detail.normalizedTerm}` : reason.label;
}

function removeSpotifyReason(
  score: DiscoveryScore,
  reason: Extract<DiscoveryReason, { kind: "spotify_artist" }>
): DiscoveryScore {
  const nextReasons = score.reasons.filter(
    (candidate) =>
      candidate.kind !== "spotify_artist" ||
      candidate.detail.normalizedTerm !== reason.detail.normalizedTerm
  );

  return {
    ...score,
    bestMatchScore: Math.max(score.bestBetsScore, score.bestMatchScore - reason.detail.score),
    reasons: nextReasons,
    spotifyMatched: nextReasons.some((candidate) => candidate.kind === "spotify_artist"),
  };
}

function replaceSpotifyReason(
  score: DiscoveryScore,
  reason: Extract<DiscoveryReason, { kind: "spotify_artist" }>,
  artist: SpotifyArtistSearchResult
): DiscoveryScore {
  return {
    ...score,
    reasons: score.reasons.map((candidate) => {
      if (
        candidate.kind !== "spotify_artist" ||
        candidate.detail.normalizedTerm !== reason.detail.normalizedTerm
      ) {
        return candidate;
      }

      return {
        ...candidate,
        label: "corrected Spotify artist",
        detail: {
          ...candidate.detail,
          matchedTerm: artist.name,
          source: "correction",
        },
      };
    }),
    spotifyMatched: true,
  };
}

function formatSpotifyMatchExplanation(reason: Extract<DiscoveryReason, { kind: "spotify_artist" }>) {
  const fieldText = `${reason.detail.field}: ${reason.detail.matchedText}`;

  if (reason.detail.source === "correction") {
    return `Corrected to ${reason.detail.matchedTerm}. Original Spotify term ${reason.detail.sourceName} matched because "${reason.detail.normalizedTerm}" appears in this event's ${fieldText}.`;
  }

  return `Matched your Spotify artist ${reason.detail.sourceName} because "${reason.detail.normalizedTerm}" appears in this event's ${fieldText}.`;
}

const sortLabels: Record<SortMode, string> = {
  "best-bets": "Best Bets",
  "best-match": "Best Match",
  soonest: "Soonest first",
  hottest: "Hottest",
  discussion: "Most discussed",
  venue: "Venue A-Z",
};

type QuickFilterDefinition = {
  id: QuickFilterId;
  label: string;
  matches: (event: EventRecord) => boolean;
};

const quickFilterGroups: Array<{
  filters: QuickFilterDefinition[];
  id: QuickFilterCategory;
  label: string;
}> = [
  {
    filters: [
      { id: "tonight", label: "Tonight", matches: isTonight },
      { id: "weekend", label: "This weekend", matches: isThisWeekend },
    ],
    id: "when",
    label: "When",
  },
  {
    filters: [
      { id: "dance", label: "Dance", matches: (event) => eventMatchesGenres(event, ["dance", "electronic"]) },
      { id: "rock", label: "Rock", matches: (event) => eventMatchesGenres(event, ["rock", "indie", "punk", "metal"]) },
    ],
    id: "genre",
    label: "Genre",
  },
  {
    filters: [
      { id: "free", label: "Free", matches: (event) => eventContains(event, ["free", "no cover"]) },
      { id: "local", label: "Local", matches: (event) => eventContains(event, ["local", "asheville"]) },
      { id: "outdoor", label: "Outdoor", matches: (event) => eventContains(event, ["outdoor", "patio"]) },
    ],
    id: "vibe",
    label: "Vibe",
  },
];

// Route genre quick filters through the taxonomy (PRD 15 / C4) so alias-tagged events
// (e.g. "dj"/"edm" → electronic) still match their canonical filter.
function eventMatchesGenres(event: EventRecord, targets: CanonicalGenre[]): boolean {
  const genres = resolveGenres([event.eventTitle, event.artistName, ...event.tags]);
  return genres.some((genre) => targets.includes(genre));
}

function getDefaultQuickFilters(): QuickFilterSelections {
  return {
    genre: "all",
    vibe: "all",
    when: "all",
  };
}

function findExactOption(options: string[], value: string) {
  const normalizedValue = value.trim().toLowerCase();

  if (!normalizedValue) {
    return null;
  }

  return options.find((option) => option.toLowerCase() === normalizedValue) ?? null;
}

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
