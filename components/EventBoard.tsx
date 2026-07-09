"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FocusEvent, KeyboardEvent, MouseEvent, PointerEvent, ReactNode } from "react";
import { Bell, CalendarCheck, Check, ChevronDown, ChevronRight, ExternalLink, Flame, Headphones, Search, Share2, SlidersHorizontal, Star, UserPlus, X } from "lucide-react";
import { useSignInChooser } from "@/components/SignInChooser";
import { SaveButton } from "@/components/SaveButton";
import { SharedSongsCard, type SharedSongSummary } from "@/components/SharedSongsCard";
import { circleBadgeCount, type CircleEventActivity } from "@/lib/social-activity-core";
import type { CuratedBy } from "@/lib/curators-core";
import { resolveGenres, type CanonicalGenre } from "@/lib/genre-taxonomy";
import { SHARED_SONGS_REFRESH_EVENT } from "@/lib/shared-songs-core";
import { useHoverPlayer, type HoverPlayer } from "@/components/useHoverPlayer";
import { isArmed } from "@/lib/hover-player-core";
import type { CommunityCounts } from "@/lib/community";
import { scoreDiscoveryEvents, type DiscoveryReason, type DiscoveryScore, type DiscoveryScoresByEvent, type SavedFavorite } from "@/lib/discovery";
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
  circleActivityByEvent?: Record<string, CircleEventActivity | undefined>;
  curatedByEvent?: Record<string, CuratedBy[] | undefined>;
  followedCuratorPicksByEvent?: Record<string, CuratedBy[] | undefined>;
  counts: Record<string, CommunityCounts | undefined>;
  discoveryScores: DiscoveryScoresByEvent;
  events: EventRecord[];
  hasTasteProfile: boolean;
  initialDiscoveryStates: DiscoveryStateByEvent;
  initialListenerPreferences: ListenerDiscoveryPreferences;
  initialSavedEventKeys: string[];
  initialSavedFavorites: SavedFavorite[];
  isSignedIn: boolean;
  musicConnections: MusicConnection[];
  musicProfileItems: MusicProfileItem[];
  preferenceSignals: DiscoveryPreferenceSignal[];
  sharedSongSummaries: Record<string, SharedSongSummary | undefined>;
  /** Count of cached matched-artist preview tracks per event (PRD 46, Story E). */
  artistTrackCounts: Record<string, number | undefined>;
  spotifyMatchCorrections: SpotifyMatchCorrection[];
  top30EventIds: string[];
  top30SourceUrl: string;
  windowLabel: string;
};

type EventActionResponse = {
  counts?: CommunityCounts;
  error?: string;
  state?: DiscoveryPersonEventState;
  /** True when this Fire/Going surfaced a visible curator pick (signed-in active curators only). */
  curatorPickAdded?: boolean;
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
const SIGNIN_NUDGE_DISMISS_KEY = "avlmc:signin-nudge-dismissed";
const KEEP_INTENT_PARAM = "keepIntent";
const NUDGEABLE_ACTIONS = new Set<CardAction>(["fire", "planning", "remove"]);
// Number of event cards shown above the collapsed filter bar (matches the desktop grid row).
const FIRST_ROW_COUNT = 3;

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

// Whether the lower-signal disclosure badges (intent sources, shared songs, circle,
// curated-by) render on the card. Hidden by the card refresh; flip to re-enable.
const SHOW_SECONDARY_CARD_BADGES = false;

// Embers visualize community FIRE traction. Their count tracks the FIRE total, capped
// so very hot cards stay performant.
const EMBER_CAP = 14;
const EMBER_PALETTE = ["#ff3d00", "#ff6a00", "#ff9500", "#ffcf33", "#ff2d55"];

function buildEmbers(count: number) {
  return Array.from({ length: Math.min(count, EMBER_CAP) }, (_, i) => ({
    key: i,
    left: Math.round((i * 53 + 11) % 100),
    delay: ((i * 0.37) % 5.2).toFixed(2),
    dur: (3 + ((i * 0.7) % 3)).toFixed(2),
    size: 3 + (i % 4),
    color: EMBER_PALETTE[i % EMBER_PALETTE.length],
  }));
}

// One-shot burst of embers when the user ignites FIRE: sparks leap from the action
// bar and float up and away while the perimeter glow lights. Mounted with a fresh
// key per ignition; unmounts itself when the animation is done.
const BURST_SPARKS = 18;

function FireBurstFx({ onDone }: { onDone: () => void }) {
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const id = window.setTimeout(() => onDoneRef.current(), 1500);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <span className="fire-burst" aria-hidden="true">
      {Array.from({ length: BURST_SPARKS }, (_, i) => (
        <i
          key={i}
          style={
            {
              left: `${34 + ((i * 37) % 46)}%`,
              width: 3 + (i % 4),
              height: 3 + (i % 4),
              background: EMBER_PALETTE[i % EMBER_PALETTE.length],
              animationDelay: `${((i * 41) % 30) / 100}s`,
              animationDuration: `${0.75 + ((i * 29) % 55) / 100}s`,
              "--dx": `${((i * 53) % 96) - 48}px`,
            } as CSSProperties
          }
        />
      ))}
    </span>
  );
}

// One shared SVG turbulence filter referenced by every card's flame ring + hotspot.
function FireTurbulenceFilter() {
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: "absolute" }}>
      <filter id="cardFireTurb" x="-30%" y="-30%" width="160%" height="160%">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.012 0.024"
          numOctaves={2}
          seed={7}
          result="noise"
        >
          <animate
            attributeName="baseFrequency"
            dur="7.5s"
            values="0.012 0.024;0.018 0.034;0.012 0.024"
            repeatCount="indefinite"
          />
        </feTurbulence>
        <feDisplacementMap
          in="SourceGraphic"
          in2="noise"
          scale={27}
          xChannelSelector="R"
          yChannelSelector="G"
        />
      </filter>
    </svg>
  );
}

// The hero headline rotates through a set of low-key, matter-of-fact lines — the
// promise stays constant (matched local shows), the phrasing keeps it fresh. First
// line renders on the server so there's no flash; the client crossfades from there.
// Rotation pauses entirely under prefers-reduced-motion.
const HERO_HEADLINES = [
  "Find your next favorite band.",
  "Your Asheville live music matchmaker.",
  "Discover Asheville shows matched to your taste.",
  "Find your next favorite artist.",
  "Live music in Asheville, matched to you.",
  "Find the Asheville show made for your taste.",
  "A better way to find your next show.",
] as const;

const HERO_HOLD_MS = 4200;
const HERO_FADE_MS = 420;

function RotatingHeadline() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    let fadeTimer: ReturnType<typeof setTimeout>;
    const cycle = window.setInterval(() => {
      setVisible(false);
      fadeTimer = setTimeout(() => {
        setIndex((current) => (current + 1) % HERO_HEADLINES.length);
        setVisible(true);
      }, HERO_FADE_MS);
    }, HERO_HOLD_MS);
    return () => {
      window.clearInterval(cycle);
      clearTimeout(fadeTimer);
    };
  }, []);

  return (
    <h1 className="sandbox-rotating-headline">
      <span data-visible={visible} style={{ transitionDuration: `${HERO_FADE_MS}ms` }}>
        {HERO_HEADLINES[index]}
      </span>
    </h1>
  );
}

export function EventBoard({
  circleActivityByEvent,
  curatedByEvent,
  followedCuratorPicksByEvent,
  counts,
  discoveryScores,
  events,
  hasTasteProfile,
  initialDiscoveryStates,
  initialListenerPreferences,
  initialSavedEventKeys,
  initialSavedFavorites,
  isSignedIn,
  musicConnections,
  musicProfileItems,
  preferenceSignals,
  sharedSongSummaries,
  artistTrackCounts,
  spotifyMatchCorrections,
  top30EventIds,
  top30SourceUrl,
  windowLabel,
}: EventBoardProps) {
  // One shared hover-listening controller for the whole board — only one event plays at a time.
  const hover = useHoverPlayer();
  const [query, setQuery] = useState("");
  const [selectedVenues, setSelectedVenues] = useState<string[]>([]);
  const [venueQuery, setVenueQuery] = useState("");
  const [tag, setTag] = useState("all");
  const [tagQuery, setTagQuery] = useState("");
  const [quickFiltersByCategory, setQuickFiltersByCategory] = useState<QuickFilterSelections>(
    getDefaultQuickFilters
  );
  const [sortMode, setSortMode] = useState<SortMode>(hasTasteProfile ? "best-match" : "best-bets");
  // Editable date range within the rolling window. 0 = the full server window; >0 = next N days.
  const [rangeDays, setRangeDays] = useState(0);
  const [customDateStart, setCustomDateStart] = useState("");
  const [customDateEnd, setCustomDateEnd] = useState("");
  const [shareStatus, setShareStatus] = useState<"idle" | "copied" | "shared">("idle");
  // Filter drawer is collapsed by default; the listener opens it deliberately.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [urlStateReady, setUrlStateReady] = useState(false);
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
  // First card starts revealed as a "this is how cards open" affordance; clicking a
  // card now navigates to its details page instead of toggling the disclosure.
  const [revealedEventId, setRevealedEventId] = useState<string | null>(events[0]?.id ?? null);
  // Going/Fire re-scores the list, but re-sorting the grid under the cursor is
  // disorienting. Freeze the visible order at click time and release it once the
  // pointer (or focus) leaves the card that was acted on.
  const [orderFreeze, setOrderFreeze] = useState<{ eventId: string; order: string[] } | null>(
    null
  );
  const [skipConfirm, setSkipConfirm] = useState(false);
  const [skipFutureConfirm, setSkipFutureConfirm] = useState(false);
  const top30EventIdSet = useMemo(() => new Set(top30EventIds), [top30EventIds]);
  const savedEventKeySet = useMemo(() => new Set(initialSavedEventKeys), [initialSavedEventKeys]);
  const [toastEvent, setToastEvent] = useState<EventRecord | null>(null);
  const [curatorPickToast, setCuratorPickToast] = useState(false);
  const [signInNudge, setSignInNudge] = useState<{ event: EventRecord; action: CardAction } | null>(null);
  const { chooser: signInChooser, openChooser } = useSignInChooser();
  const [saveOfferEvent, setSaveOfferEvent] = useState<EventRecord | null>(null);
  const replayedIntent = useRef(false);
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
  const dateBounds = useMemo(() => {
    const dates = visibleEvents.map((event) => event.eventDate).sort();
    return { max: dates.at(-1) ?? "", min: dates[0] ?? "" };
  }, [visibleEvents]);
  // Precompute each event's canonical genres once (keyed off the event list, not the search
  // query) so genre quick filters are a cheap Set lookup rather than running the taxonomy's
  // normalization regex inside the per-keystroke filter loop.
  const eventGenres = useMemo(
    () =>
      new Map<string, Set<CanonicalGenre>>(
        visibleEvents.map((event) => [
          event.id,
          new Set(resolveGenres([event.eventTitle, event.artistName, ...event.tags])),
        ])
      ),
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
    rangeDays !== 0 ||
    customDateStart !== "" ||
    customDateEnd !== "" ||
    sortMode !== defaultSortMode;

  const activeFilterCount =
    selectedVenues.length +
    (tag !== "all" ? 1 : 0) +
    activeQuickFilters.length +
    (rangeDays !== 0 || customDateStart || customDateEnd ? 1 : 0) +
    (sortMode !== defaultSortMode ? 1 : 0);

  const effectiveWindowLabel = rangeWindowLabel(
    rangeDays,
    windowLabel,
    customDateStart,
    customDateEnd
  );

  useEffect(() => {
    if (urlStateReady) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    setQuery((params.get("q") ?? "").slice(0, 120));
    setSelectedVenues(
      Array.from(
        new Set(
          params
            .getAll("venue")
            .map((value) => findExactOption(allVenues, value))
            .filter((value): value is string => Boolean(value))
        )
      )
    );

    const sharedTag = findExactOption(allTags, params.get("tag") ?? "");
    setTag(sharedTag ?? "all");

    const sharedRange = Number(params.get("range"));
    setRangeDays(DATE_RANGE_OPTIONS.some((option) => option.days === sharedRange) ? sharedRange : 0);

    let sharedStart = validDateParam(params.get("from"));
    let sharedEnd = validDateParam(params.get("to"));
    if (sharedStart && sharedEnd && sharedStart > sharedEnd) {
      [sharedStart, sharedEnd] = [sharedEnd, sharedStart];
    }
    setCustomDateStart(sharedStart);
    setCustomDateEnd(sharedEnd);
    if (sharedStart || sharedEnd) {
      setRangeDays(0);
    }

    setQuickFiltersByCategory({
      genre: validQuickFilter("genre", params.get("genre")),
      vibe: validQuickFilter("vibe", params.get("vibe")),
      when: validQuickFilter("when", params.get("when")),
    });

    const sharedSort = params.get("sort");
    setSortMode(
      isSortMode(sharedSort) && (hasTasteProfile || sharedSort !== "best-match")
        ? sharedSort
        : defaultSortMode
    );
    setUrlStateReady(true);
  }, [allTags, allVenues, defaultSortMode, hasTasteProfile, urlStateReady]);

  useEffect(() => {
    if (!urlStateReady) {
      return;
    }

    const url = buildFilterUrl(window.location.href, {
      customDateEnd,
      customDateStart,
      defaultSortMode,
      query,
      quickFiltersByCategory,
      rangeDays,
      selectedVenues,
      sortMode,
      tag,
    });
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [
    customDateEnd,
    customDateStart,
    defaultSortMode,
    query,
    quickFiltersByCategory,
    rangeDays,
    selectedVenues,
    sortMode,
    tag,
    urlStateReady,
  ]);

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

  // Action-preserving sign-in replay (PRD 13 / C2): after an anonymous fire/plan/remove leads to
  // sign-in, the pending action is carried in the `keepIntent` query param and replayed exactly
  // once against the now-signed-in account (idempotent — skipped if already in that state), then
  // we offer a one-tap save. The param is cleared so it never replays again.
  useEffect(() => {
    if (!isSignedIn || replayedIntent.current) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const raw = params.get(KEEP_INTENT_PARAM);
    if (!raw) {
      return;
    }
    replayedIntent.current = true;

    const separator = raw.indexOf(":");
    const action = (separator === -1 ? raw : raw.slice(0, separator)) as CardAction;
    const eventId = separator === -1 ? "" : raw.slice(separator + 1);

    params.delete(KEEP_INTENT_PARAM);
    const nextSearch = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`
    );

    const targetEvent = events.find((candidate) => candidate.id === eventId);
    if (!targetEvent || !NUDGEABLE_ACTIONS.has(action)) {
      return;
    }

    const state = discoveryStates[eventId];
    const alreadyApplied =
      (action === "fire" && Boolean(state?.fire)) ||
      (action === "planning" && Boolean(state?.planning)) ||
      (action === "remove" && Boolean(state?.removed));

    if (!alreadyApplied) {
      void recordCardAction(targetEvent, action, { silent: true });
    }

    setSaveOfferEvent(targetEvent);
  }, [discoveryStates, events, isSignedIn]);

  useEffect(() => {
    setEventScores(
      scoreDiscoveryEvents({
        connections: musicConnections,
        counts: eventCounts,
        events,
        listenerPreferences,
        preferenceSignals: localPreferenceSignals,
        profileItems: musicProfileItems,
        savedFavorites: initialSavedFavorites,
        spotifyMatchCorrections,
        circleActivityByEvent,
        followedCuratorPicksByEvent,
      })
    );
  }, [
    circleActivityByEvent,
    eventCounts,
    events,
    followedCuratorPicksByEvent,
    initialSavedFavorites,
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
    // Length-bound the user-typed query before it flows into any text matching (defense-in-depth
    // against pathological inputs); a search term longer than this never adds signal.
    const normalizedQuery = query.trim().toLowerCase().slice(0, 120);

    const matchesQuickFilter = (event: EventRecord, filter: QuickFilterDefinition) => {
      switch (filter.id) {
        case "tonight":
          return isTonight(event);
        case "weekend":
          return isThisWeekend(event);
        case "free":
          return eventContains(event, ["free", "no cover"]);
        case "local":
          return eventContains(event, ["local", "asheville"]);
        case "outdoor":
          return eventContains(event, ["outdoor", "patio"]);
        case "dance":
        case "rock":
          return (filter.genres ?? []).some((genre) => eventGenres.get(event.id)?.has(genre));
        default:
          return true;
      }
    };

    return visibleEvents
      .filter(
        (event) =>
          matchesSearch(event, normalizedQuery) &&
          (selectedVenues.length === 0 || selectedVenues.includes(event.venueName)) &&
          (tag === "all" || event.tags.includes(tag)) &&
          isWithinRange(event, rangeDays, customDateStart, customDateEnd) &&
          activeQuickFilters.every((filter) => matchesQuickFilter(event, filter))
      )
      .sort((a, b) => compareEvents(a, b, eventCounts, eventScores, sortMode));
  }, [activeQuickFilters, customDateEnd, customDateStart, eventCounts, eventGenres, eventScores, query, rangeDays, selectedVenues, sortMode, tag, visibleEvents]);

  // While an order freeze is active, keep rendering the order captured at click time.
  // Filtering still applies (removed cards drop out); brand-new cards append at the end.
  const displayedEvents = useMemo(() => {
    if (!orderFreeze) {
      return filteredEvents;
    }
    const rank = new Map(orderFreeze.order.map((id, index) => [id, index]));
    return [...filteredEvents].sort(
      (a, b) =>
        (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER)
    );
  }, [filteredEvents, orderFreeze]);

  function clearFilters() {
    setQuery("");
    setSelectedVenues([]);
    setVenueQuery("");
    setTag("all");
    setTagQuery("");
    setQuickFiltersByCategory(getDefaultQuickFilters());
    setSortMode(defaultSortMode);
    setRangeDays(0);
    setCustomDateStart("");
    setCustomDateEnd("");
  }

  function selectPresetRange(days: number) {
    setRangeDays(days);
    setCustomDateStart("");
    setCustomDateEnd("");
  }

  async function shareFilters() {
    const url = buildFilterUrl(window.location.href, {
      customDateEnd,
      customDateStart,
      defaultSortMode,
      query,
      quickFiltersByCategory,
      rangeDays,
      selectedVenues,
      sortMode,
      tag,
    }).toString();

    try {
      if (navigator.share) {
        await navigator.share({ title: "AVLmc filtered shows", url });
        setShareStatus("shared");
      } else {
        await copyText(url);
        setShareStatus("copied");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      await copyText(url);
      setShareStatus("copied");
    }

    window.setTimeout(() => setShareStatus("idle"), 2200);
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

      // Shared Listening (PRD 17): Going/Fire may have seeded shared songs server-side (only for
      // signed-in connected listeners; a no-op otherwise). Nudge any mounted shared-song surface
      // for this event to re-fetch. `action` is a parameter, so recordCardAction stays stable.
      if (action === "fire" || action === "planning") {
        window.dispatchEvent(
          new CustomEvent(SHARED_SONGS_REFRESH_EVENT, { detail: { eventId: event.id } })
        );
      }

      // Append a taste signal so the scoring engine re-ranks similar events immediately.
      if (action !== "avlgo_click") {
        setLocalPreferenceSignals((current) => [
          {
            action,
            artistName: event.artistName,
            createdAt: new Date().toISOString(),
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

  // Surface a gentle, session-dismissible sign-in nudge after an anonymous action. The action
  // itself still applied (anonymous path); the nudge invites keeping it on an account.
  function maybeShowSignInNudge(event: EventRecord, action: CardAction) {
    if (isSignedIn || !NUDGEABLE_ACTIONS.has(action)) {
      return;
    }
    if (typeof window !== "undefined" && window.sessionStorage.getItem(SIGNIN_NUDGE_DISMISS_KEY)) {
      return;
    }
    setSignInNudge({ action, event });
  }

  function dismissSignInNudge() {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem(SIGNIN_NUDGE_DISMISS_KEY, "1");
    }
    setSignInNudge(null);
  }

  function signInToKeep() {
    if (!signInNudge) {
      return;
    }
    // Pre-redirect chooser (PRD 43): the keep-intent callback rides through whichever door the
    // listener picks, so the original going/fire lands after sign-in exactly as before.
    const callbackUrl = `/?${KEEP_INTENT_PARAM}=${signInNudge.action}:${signInNudge.event.id}`;
    openChooser({
      callbackUrl,
      source: "event-board-nudge",
      heading: "Sign in to keep this",
      description:
        "Your going/fire lands on your account the moment you're signed in. Spotify is optional — email works for everyone.",
    });
  }

  async function togglePositiveAction(event: EventRecord, action: Extract<ActionKind, "fire" | "going">) {
    clearTooltip();
    setToastEvent(null);
    // Hold the current visible order until the pointer leaves this card (see orderFreeze).
    setOrderFreeze({ eventId: event.id, order: displayedEvents.map((entry) => entry.id) });
    const cardAction: CardAction = action === "going" ? "planning" : "fire";
    const data = await recordCardAction(event, cardAction);
    if (data?.curatorPickAdded) {
      setCuratorPickToast(true);
      window.setTimeout(() => setCuratorPickToast(false), 3000);
    }
    maybeShowSignInNudge(event, cardAction);
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
        maybeShowSignInNudge(event, "remove");
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
      maybeShowSignInNudge(confirmEvent, "remove");
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

  function renderEventCard(event: EventRecord, index: number) {
    const score = eventScores[event.id];
    const reasons = score?.reasons ?? [];
    const countsForEvent = eventCounts[event.id];
    const state = discoveryStates[event.id];
    // The songs chip advertises the matched artist's playable tracks (PRD 46, Story E). It appears
    // ONLY when the event has a confirmed Spotify artist match WITH playable tracks — those rows
    // (event_artist_tracks) exist only for published matches — and is hidden entirely otherwise.
    const playableSongs = artistTrackCounts[event.id] ?? 0;

    return (
      <DiscoveryEventCard
        activeTooltip={activeTooltip}
        counts={countsForEvent}
        event={event}
        hover={hover}
        playableSongs={playableSongs}
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
        onSettle={() => {
          setOrderFreeze((current) => (current?.eventId === event.id ? null : current));
        }}
        onScoreChange={(updatedScore) => {
          setEventScores((current) => ({
            ...current,
            [event.id]: updatedScore,
          }));
        }}
        onTogglePositiveAction={togglePositiveAction}
        onTrackAvlgoClick={trackAvlgoClick}
        circleActivity={circleActivityByEvent?.[event.id]}
        curatedBy={curatedByEvent?.[event.id]}
        reasons={reasons}
        score={score}
        sharedSongSummary={sharedSongSummaries[event.id]}
        state={state}
      />
    );
  }

  return (
    <>
      <section className="sandbox-hero" id="for-you">
        <div className="sandbox-header">
          <p className="eyebrow">For You</p>
          <RotatingHeadline />
          <p className="lede">
            A {rangeDays > 0 ? "" : "rolling "}{effectiveWindowLabel} live music board, ranked by your taste, local pulse, and curator signals.
          </p>
          <div className="sandbox-search-row">
            <label className="sandbox-search">
              <Search aria-hidden="true" size={17} strokeWidth={2.4} />
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search venues, artists, signals"
                type="search"
                value={query}
              />
            </label>
            <CuratorInline />
          </div>
        </div>

        <SocialDiscoveryBeats
          counts={eventCounts}
          events={filteredEvents.slice(0, 6)}
          scores={eventScores}
          top30EventIds={top30EventIdSet}
          top30SourceUrl={top30SourceUrl}
        />
      </section>

      {errorMessage ? <p className="sandbox-error-message">{errorMessage}</p> : null}

      <FireTurbulenceFilter />

      {filteredEvents.length === 0 ? (
        <section className="empty-state">
          <h2>No matching music events</h2>
          <p>Try clearing a filter or searching for a different artist, venue, or tag.</p>
        </section>
      ) : (
        <section className="sandbox-layout" id="cards" aria-label="Upcoming music events">
          {displayedEvents.slice(0, FIRST_ROW_COUNT).map((event, index) => renderEventCard(event, index))}
        </section>
      )}

      <section className="search-panel discovery-filter-panel" aria-label="Discovery controls">
        <div className="filter-panel-head">
          <button
            aria-controls="filter-drawer"
            aria-expanded={filtersOpen}
            className="filter-reset filter-drawer-toggle"
            onClick={() => setFiltersOpen((current) => !current)}
            type="button"
          >
            <SlidersHorizontal aria-hidden="true" size={15} strokeWidth={2.6} />
            Filters
            {activeFilterCount > 0 ? <em className="filter-count-badge">{activeFilterCount}</em> : null}
            <ChevronDown
              aria-hidden="true"
              className={`filter-drawer-chevron${filtersOpen ? " is-open" : ""}`}
              size={15}
              strokeWidth={2.6}
            />
          </button>
          <div>
            <strong>
              {filteredEvents.length} of {visibleEvents.length} showing
            </strong>
          </div>
          <div className="filter-panel-actions">
            <button className="filter-reset" onClick={() => void shareFilters()} type="button">
              {shareStatus === "idle" ? (
                <Share2 aria-hidden="true" size={15} strokeWidth={2.6} />
              ) : (
                <Check aria-hidden="true" size={15} strokeWidth={2.6} />
              )}
              {shareStatus === "copied" ? "Link copied" : shareStatus === "shared" ? "Shared" : "Share filters"}
            </button>
            {hasActiveFilters ? (
              <button className="filter-reset" onClick={clearFilters} type="button">
                <X aria-hidden="true" size={15} strokeWidth={2.6} />
                Reset
              </button>
            ) : null}
          </div>
        </div>

        {filtersOpen ? (
        <div className="filter-drawer" id="filter-drawer">
        <div className="filter-section">
          <span className="filter-section-label">Dates</span>
          <div className="filter-group" aria-label="Date range filters">
            {DATE_RANGE_OPTIONS.map((option) => (
              <button
                aria-pressed={
                  rangeDays === option.days && !customDateStart && !customDateEnd
                }
                className="filter-chip"
                key={option.days}
                onClick={() => selectPresetRange(option.days)}
                type="button"
              >
                {option.label}
              </button>
            ))}
            <div className="filter-date-range" role="group" aria-label="Custom date range">
              <label>
                <span>From</span>
                <input
                  aria-label="Start date"
                  max={customDateEnd || dateBounds.max}
                  min={dateBounds.min}
                  onChange={(event) => {
                    setRangeDays(0);
                    setCustomDateStart(event.target.value);
                  }}
                  type="date"
                  value={customDateStart}
                />
              </label>
              <span aria-hidden="true">to</span>
              <label>
                <span>To</span>
                <input
                  aria-label="End date"
                  max={dateBounds.max}
                  min={customDateStart || dateBounds.min}
                  onChange={(event) => {
                    setRangeDays(0);
                    setCustomDateEnd(event.target.value);
                  }}
                  type="date"
                  value={customDateEnd}
                />
              </label>
            </div>
          </div>
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
        </div>
        ) : null}
      </section>

      <section className="toolbar" aria-label="Event list summary">
        <div>
          <span className="toolbar-label">Window</span>
          <strong>{effectiveWindowLabel}</strong>
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

      {displayedEvents.length > FIRST_ROW_COUNT ? (
        <section className="sandbox-layout" aria-label="More music events">
          {displayedEvents
            .slice(FIRST_ROW_COUNT)
            .map((event, index) => renderEventCard(event, index + FIRST_ROW_COUNT))}
        </section>
      ) : null}

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

      {curatorPickToast ? (
        <div className="sandbox-toast" role="status">
          <span>Added to your curator picks.</span>
        </div>
      ) : null}

      {saveOfferEvent ? (
        <div className="signin-nudge" role="status">
          <p>
            You&apos;re in. Want to save <strong>{saveOfferEvent.eventTitle}</strong> to your Saved
            space?
          </p>
          <div className="signin-nudge-actions">
            <SaveButton
              eventId={saveOfferEvent.id}
              initialSaved={false}
              isSignedIn
              itemKey={saveOfferEvent.id}
              itemType="event"
              label={saveOfferEvent.eventTitle}
              onToggle={() => setSaveOfferEvent(null)}
              variant="chip"
            />
            <button className="nudge-dismiss" onClick={() => setSaveOfferEvent(null)} type="button">
              Not now
            </button>
          </div>
        </div>
      ) : null}

      {signInNudge && !isSignedIn ? (
        <div className="signin-nudge" role="status">
          <p>Sign in to keep this and tune your recommendations.</p>
          <div className="signin-nudge-actions">
            <button className="nudge-primary" onClick={signInToKeep} type="button">
              Sign in
            </button>
            <button className="nudge-dismiss" onClick={dismissSignInNudge} type="button">
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
      {signInChooser}
    </>
  );
}

// The board card's songs affordance (PRD 46, Story E). Advertises listenability ("♫ N songs" in a
// listenable style when > 0) and rewards mouse/keyboard dwell with faded-in preview audio via the
// shared hover player. Hover/focus arm; leaving disarms. Click is never intercepted here, so the
// card's own click-to-navigate is untouched (the interactive buttons stopPropagation only). Touch
// pointers don't arm (no hover), degrading to a plain chip.
function HoverSongsChip({
  event,
  hover,
  playableSongs,
}: {
  event: EventRecord;
  hover: HoverPlayer;
  playableSongs: number;
}) {
  const { state } = hover;
  const isThisEvent = state.eventId === event.id;
  const armed = isThisEvent && isArmed(state);
  const playing = isThisEvent && state.phase === "playing";
  const blocked = isThisEvent && state.phase === "blocked";

  // Hidden unless the event has a confirmed artist match WITH playable songs — no empty/"0 songs"
  // chip ever renders on the board.
  if (playableSongs <= 0) {
    return null;
  }

  function onEnter(pointerType: string) {
    // Only a real hovering pointer (mouse/pen) arms — touch keeps plain tap behavior.
    if (pointerType !== "touch") {
      hover.arm(event.id);
    }
  }

  return (
    <div
      className={`sandbox-pulse sandbox-pulse-chip is-listenable${armed ? " is-arming" : ""}${
        playing ? " is-playing" : ""
      }`}
      aria-label={`${playableSongs} playable songs — hover to listen`}
      onPointerEnter={(pointerEvent) => onEnter(pointerEvent.pointerType)}
      onPointerLeave={() => hover.disarm(event.id)}
      onFocus={() => hover.arm(event.id)}
      onBlur={() => hover.disarm(event.id)}
      tabIndex={0}
    >
      <span className="chip-note" aria-hidden="true">
        ♫
      </span>
      <span>
        {playableSongs} {playableSongs === 1 ? "song" : "songs"}
      </span>
      {armed ? (
        <span className="chip-preplay" role="status" aria-label="music will play soon">
          <span className="chip-preplay-ring" aria-hidden="true" />
        </span>
      ) : null}
      {playing ? (
        <button
          className="chip-stop"
          aria-label="Stop preview"
          onClick={(clickEvent) => {
            clickEvent.stopPropagation();
            hover.stop();
          }}
          type="button"
        >
          ■
        </button>
      ) : null}
      {blocked ? (
        <button
          className="chip-unlock"
          onClick={(clickEvent) => {
            clickEvent.stopPropagation();
            hover.unlock(event.id);
          }}
          type="button"
        >
          click ♫ to listen
        </button>
      ) : null}
    </div>
  );
}

function DiscoveryEventCard({
  activeTooltip,
  circleActivity,
  curatedBy,
  counts,
  event,
  hover,
  playableSongs,
  index,
  isPending,
  isRevealed,
  isSaved,
  isSignedIn,
  isTop30,
  onClearTooltip,
  onQueueTooltip,
  onRemove,
  onScoreChange,
  onSettle,
  onTogglePositiveAction,
  onTrackAvlgoClick,
  reasons,
  score,
  sharedSongSummary,
  state,
}: {
  activeTooltip: ActiveTooltip | null;
  circleActivity: CircleEventActivity | undefined;
  curatedBy: CuratedBy[] | undefined;
  counts: CommunityCounts | undefined;
  event: EventRecord;
  hover: HoverPlayer;
  playableSongs: number;
  index: number;
  isPending: boolean;
  isRevealed: boolean;
  isSaved: boolean;
  isSignedIn: boolean;
  isTop30: boolean;
  onClearTooltip: () => void;
  onQueueTooltip: (eventId: string, action: ActionKind) => void;
  onRemove: (event: EventRecord) => void;
  onScoreChange: (score: DiscoveryScore) => void;
  onSettle: () => void;
  onTogglePositiveAction: (event: EventRecord, action: Extract<ActionKind, "fire" | "going">) => void;
  onTrackAvlgoClick: (event: EventRecord) => void;
  reasons: DiscoveryReason[];
  score: DiscoveryScore | undefined;
  sharedSongSummary: SharedSongSummary | undefined;
  state: DiscoveryPersonEventState | undefined;
}) {
  const date = parseEventDate(event);
  const tag = getPrimaryTag(event);
  const match = formatMatchScore(score, index);
  const fire = counts?.fire ?? 0;
  const going = counts?.going ?? 0;
  const spotifySaves = counts?.goingSources.spotify ?? 0;
  const ticketClicks = counts?.goingSources.ticket_click ?? 0;

  // Embers show on any card with community FIRE traction; the glow/turbulence/hotspot
  // only ignite once THIS user has fired.
  const userFired = state?.fire ?? false;
  const showEmbers = fire > 0;
  const embers = showEmbers ? buildEmbers(fire) : [];
  const cardElRef = useRef<HTMLElement | null>(null);
  const eventDetailHref = `/event/${encodeURIComponent(event.id)}`;
  // One-shot ember burst, armed each time the user ignites FIRE (off → on).
  const [burstAt, setBurstAt] = useState(0);

  function handleFirePointerMove(pointerEvent: PointerEvent<HTMLElement>) {
    if (!userFired) {
      return;
    }
    const el = cardElRef.current;
    if (!el) {
      return;
    }
    const rect = el.getBoundingClientRect();
    const x = ((pointerEvent.clientX - rect.left) / rect.width) * 100;
    const y = ((pointerEvent.clientY - rect.top) / rect.height) * 100;
    const edge = 1 - Math.min(x, 100 - x, y, 100 - y) / 50;
    el.style.setProperty("--mx", `${x}%`);
    el.style.setProperty("--my", `${y}%`);
    el.style.setProperty("--edge", edge.toFixed(3));
  }

  function setFireChurn(value: number) {
    if (!userFired) {
      return;
    }
    cardElRef.current?.style.setProperty("--churn", String(value));
  }

  // Any click on a non-interactive surface (poster, title, pills, empty space)
  // clicks through to the event details page. Buttons, links, inputs, and labels
  // keep their own behavior via the isInteractiveTarget guard.
  function handleCardClick(eventClick: MouseEvent<HTMLElement>) {
    if (isInteractiveTarget(eventClick.target)) {
      return;
    }

    window.location.assign(eventDetailHref);
  }

  function handleCardKeyDown(keyEvent: KeyboardEvent<HTMLElement>) {
    if (keyEvent.key !== "Enter" && keyEvent.key !== " ") {
      return;
    }

    if (isInteractiveTarget(keyEvent.target)) {
      return;
    }

    keyEvent.preventDefault();
    window.location.assign(eventDetailHref);
  }

  return (
    <article
      ref={cardElRef}
      className={`sandbox-event-card fresh-card ${isRevealed ? "is-revealed" : ""}${
        userFired ? " is-fired fx-turbulence fx-hotspot" : ""
      }`}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
      onPointerMove={handleFirePointerMove}
      onPointerDown={() => setFireChurn(1)}
      onPointerUp={() => setFireChurn(0)}
      onPointerLeave={() => {
        setFireChurn(0);
        onSettle();
      }}
      onBlur={(blurEvent: FocusEvent<HTMLElement>) => {
        if (!blurEvent.currentTarget.contains(blurEvent.relatedTarget as Node | null)) {
          onSettle();
        }
      }}
      tabIndex={0}
    >
      {showEmbers || userFired ? (
        <div className="fire-fx" aria-hidden="true">
          {userFired ? <span className="fire-fx-glow" /> : null}
          {userFired ? <span className="fire-fx-turb" /> : null}
          {userFired ? <span className="fire-fx-hotspot" /> : null}
          {showEmbers ? (
            <span className="fire-fx-embers">
              {embers.map((em) => (
                <i
                  key={em.key}
                  style={{
                    left: `${em.left}%`,
                    width: em.size,
                    height: em.size,
                    background: em.color,
                    animationDelay: `${em.delay}s`,
                    animationDuration: `${em.dur}s`,
                  }}
                />
              ))}
            </span>
          ) : null}
        </div>
      ) : null}

      {burstAt ? <FireBurstFx key={burstAt} onDone={() => setBurstAt(0)} /> : null}

      <EventPoster event={event} />

      <div className="sandbox-card-top">
        <div className="sandbox-card-tags">
          <span className="sandbox-card-tag">{tag}</span>
        </div>
        <div className="sandbox-card-top-right">
          <HoverSongsChip event={event} hover={hover} playableSongs={playableSongs} />
          <strong className="sandbox-match-pill">{match}% match</strong>
          {isTop30 ? (
            <span className="sandbox-top30-badge">
              <Star aria-hidden="true" size={12} strokeWidth={2.6} />
              Top 30
            </span>
          ) : null}
        </div>
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
          {SHOW_SECONDARY_CARD_BADGES && (spotifySaves > 0 || ticketClicks > 0) ? (
            <div className="intent-mini-row card-intent-row" aria-label="Saved signal sources">
              {spotifySaves > 0 ? <span className="spotify-source">Spotify {spotifySaves}</span> : null}
              {ticketClicks > 0 ? <span>AVLgo {ticketClicks}</span> : null}
            </div>
          ) : null}
          <div className="sandbox-card-links" aria-label="Event links">
            <Link href={eventDetailHref} prefetch={false}>
              Details
            </Link>
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
          {SHOW_SECONDARY_CARD_BADGES ? (
            <SharedSongsCard eventId={event.id} initialSummary={sharedSongSummary} />
          ) : null}
          {SHOW_SECONDARY_CARD_BADGES && circleBadgeCount(circleActivity) > 0 ? (
            <span
              className="circle-badge"
              title={`${circleBadgeCount(circleActivity)} from your circle`}
            >
              👥 {circleBadgeCount(circleActivity)} from your circle
            </span>
          ) : null}
          {SHOW_SECONDARY_CARD_BADGES && curatedBy && curatedBy.length > 0 ? (
            <a
              className="curated-by-badge"
              href={`/curator/${encodeURIComponent(curatedBy[0].handle)}`}
              onClick={(clickEvent) => clickEvent.stopPropagation()}
              title={`Curated by ${curatedBy.map((c) => c.displayName).join(", ")}`}
            >
              ★ curated by {curatedBy[0].displayName}
              {curatedBy.length > 1 ? ` +${curatedBy.length - 1}` : ""}
            </a>
          ) : null}
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
          onClick={() => {
            if (!userFired) {
              // Igniting (not un-firing): burst embers up from the action bar.
              setBurstAt(Date.now());
            }
            onTogglePositiveAction(event, "fire");
          }}
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

  // Remove is a momentary action, not a toggle — it gets no aria-pressed state (which
  // also keeps it out of the depressed/dull "toggle OFF" keycap styling).
  return (
    <button
      aria-describedby={isTooltipActive ? tooltipId : undefined}
      aria-label={ariaLabel}
      aria-pressed={action === "remove" ? undefined : isPressed}
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
            <Link
              className="sandbox-beat-tile"
              href={`/event/${encodeURIComponent(event.id)}`}
              key={event.id}
              prefetch={false}
            >
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

function CuratorInline() {
  return (
    <div
      className="curator-inline"
      id="curators"
      aria-label="Curators"
      title="Follow local tastemakers and music circles so their show picks carry into your discovery feed."
    >
      <span className="curator-status">
        <Bell aria-hidden="true" size={13} strokeWidth={2.6} />
        Curators
      </span>
      <Link className="curator-action is-playlist" href="/curators">
        Browse
        <ChevronRight aria-hidden="true" size={14} strokeWidth={2.4} />
      </Link>
      <Link className="curator-action" href="/curators/apply">
        <UserPlus aria-hidden="true" size={13} strokeWidth={2.6} />
        Sign up
      </Link>
      <Link className="curator-action" href="/curators/recommend">
        Recommend
      </Link>
    </div>
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

/** Selectable date ranges within the rolling window. 0 = the full server window (default). */
const DATE_RANGE_OPTIONS: Array<{ days: number; label: string }> = [
  { days: 0, label: "Full window" },
  { days: 7, label: "Next 7 days" },
  { days: 14, label: "Next 14 days" },
];

/** Apply an inclusive custom range, or a next-N-days preset within the server window. */
function isWithinRange(event: EventRecord, days: number, customStart: string, customEnd: string) {
  if (customStart && event.eventDate < customStart) {
    return false;
  }
  if (customEnd && event.eventDate > customEnd) {
    return false;
  }
  if (customStart || customEnd) {
    return true;
  }
  if (days <= 0) {
    return true;
  }
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  end.setHours(23, 59, 59, 999);
  const date = parseEventDate(event);
  return date >= start && date <= end;
}

/** Client-side label for the selected range; falls back to the server's full-window label. */
function rangeWindowLabel(
  days: number,
  fullWindowLabel: string,
  customStart: string,
  customEnd: string
) {
  if (customStart || customEnd) {
    const startLabel = customStart ? formatMonthDay(parseDateParam(customStart)) : "First show";
    const endLabel = customEnd ? formatMonthDay(parseDateParam(customEnd)) : "Last show";
    return `${startLabel} – ${endLabel}`;
  }
  if (days <= 0) {
    return fullWindowLabel;
  }
  const start = new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  return `${formatMonthDay(start)} – ${formatMonthDay(end)}`;
}

function parseDateParam(value: string) {
  return new Date(`${value}T12:00:00`);
}

function validDateParam(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return "";
  }
  return Number.isNaN(parseDateParam(value).getTime()) ? "" : value;
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

// Quick filters are pure data (no stored predicate). Matching is resolved by a concrete switch
// on `id` in `filteredEvents`; genre filters carry canonical genres matched against each event's
// precomputed genre set. Keeping this data-only avoids dynamic function dispatch in the hot path.
type QuickFilterDefinition = {
  id: QuickFilterId;
  label: string;
  genres?: CanonicalGenre[];
};

const quickFilterGroups: Array<{
  filters: QuickFilterDefinition[];
  id: QuickFilterCategory;
  label: string;
}> = [
  {
    filters: [
      { id: "tonight", label: "Tonight" },
      { id: "weekend", label: "This weekend" },
    ],
    id: "when",
    label: "When",
  },
  {
    filters: [
      { id: "dance", label: "Dance", genres: ["dance", "electronic"] },
      { id: "rock", label: "Rock", genres: ["rock", "indie", "punk", "metal"] },
    ],
    id: "genre",
    label: "Genre",
  },
  {
    filters: [
      { id: "free", label: "Free" },
      { id: "local", label: "Local" },
      { id: "outdoor", label: "Outdoor" },
    ],
    id: "vibe",
    label: "Vibe",
  },
];

function getDefaultQuickFilters(): QuickFilterSelections {
  return {
    genre: "all",
    vibe: "all",
    when: "all",
  };
}

function validQuickFilter(category: QuickFilterCategory, value: string | null) {
  const group = quickFilterGroups.find((candidate) => candidate.id === category);
  return group?.filters.some((filter) => filter.id === value)
    ? (value as QuickFilterId)
    : "all";
}

function isSortMode(value: string | null): value is SortMode {
  return Boolean(value && Object.prototype.hasOwnProperty.call(sortLabels, value));
}

type ShareableFilterState = {
  customDateEnd: string;
  customDateStart: string;
  defaultSortMode: SortMode;
  query: string;
  quickFiltersByCategory: QuickFilterSelections;
  rangeDays: number;
  selectedVenues: string[];
  sortMode: SortMode;
  tag: string;
};

const FILTER_URL_PARAMS = ["q", "venue", "tag", "range", "from", "to", "when", "genre", "vibe", "sort"];

function buildFilterUrl(href: string, state: ShareableFilterState) {
  const url = new URL(href);
  for (const key of FILTER_URL_PARAMS) {
    url.searchParams.delete(key);
  }

  const query = state.query.trim().slice(0, 120);
  if (query) url.searchParams.set("q", query);
  for (const venue of state.selectedVenues) url.searchParams.append("venue", venue);
  if (state.tag !== "all") url.searchParams.set("tag", state.tag);
  if (state.customDateStart) url.searchParams.set("from", state.customDateStart);
  if (state.customDateEnd) url.searchParams.set("to", state.customDateEnd);
  if (!state.customDateStart && !state.customDateEnd && state.rangeDays > 0) {
    url.searchParams.set("range", String(state.rangeDays));
  }
  for (const category of ["when", "genre", "vibe"] as const) {
    const filter = state.quickFiltersByCategory[category];
    if (filter !== "all") url.searchParams.set(category, filter);
  }
  if (state.sortMode !== state.defaultSortMode) url.searchParams.set("sort", state.sortMode);

  return url;
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  window.prompt("Copy this filtered AVLmc link:", value);
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
