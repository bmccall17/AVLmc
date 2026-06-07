"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CalendarCheck, ChevronRight, ExternalLink, Flame, Headphones, Search, X } from "lucide-react";

export type FreshSandboxEvent = {
  artist: string;
  dateLabel: string;
  dayLabel: string;
  detailHref: string;
  eventUrl: string;
  fire: number;
  fireSelected: boolean;
  going: number;
  goingSelected: boolean;
  id: string;
  imageUrl: string | null;
  initials: string;
  match: number;
  note: string;
  songs: number;
  tag: string;
  time: string;
  title: string;
  venue: string;
};

type ActionKind = "fire" | "going" | "remove";
type DiscoveryAction = ActionKind | "avlgo_click" | "impression" | "unremove";

type ActiveTooltip = {
  action: ActionKind;
  eventId: string;
};

type EventActionResponse = {
  counts?: {
    fire: number;
    going: number;
    notes: number;
    songs: number;
    voices: number;
  };
  error?: string;
  state?: {
    fire: boolean;
    planning: boolean;
    removed: boolean;
  };
};

const TOOLTIP_DELAY_MS = 1500;
const SKIP_REMOVE_CONFIRM_KEY = "avlmc:sandbox:skip-remove-confirm";

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

export function FreshDiscoveryExperience({ events }: { events: FreshSandboxEvent[] }) {
  const [cards, setCards] = useState(events);
  const [activeTooltip, setActiveTooltip] = useState<ActiveTooltip | null>(null);
  const [confirmEvent, setConfirmEvent] = useState<FreshSandboxEvent | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [revealedEventId, setRevealedEventId] = useState<string | null>(events[0]?.id ?? null);
  const [skipConfirm, setSkipConfirm] = useState(false);
  const [skipFutureConfirm, setSkipFutureConfirm] = useState(false);
  const [toastEvent, setToastEvent] = useState<FreshSandboxEvent | null>(null);
  const tooltipTimer = useRef<number | null>(null);
  const trackedImpressions = useRef(new Set<string>());

  useEffect(() => {
    setCards(events);
    setRevealedEventId(events[0]?.id ?? null);
  }, [events]);

  useEffect(() => {
    setSkipConfirm(window.localStorage.getItem(SKIP_REMOVE_CONFIRM_KEY) === "true");

    return () => {
      clearTooltipTimer();
    };
  }, []);

  useEffect(() => {
    for (const event of cards.slice(0, 12)) {
      if (trackedImpressions.current.has(event.id)) {
        continue;
      }

      trackedImpressions.current.add(event.id);
      void sendDiscoveryAction(event, "impression", { silent: true, surface: "sandbox:fresh" });
    }
    // sendDiscoveryAction is intentionally not a dependency; impression tracking should follow visible cards.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);

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

  async function sendDiscoveryAction(
    event: FreshSandboxEvent,
    action: DiscoveryAction,
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
          surface: options.surface ?? "sandbox:fresh",
        }),
      });
      const data = (await response.json()) as EventActionResponse;

      if (!response.ok) {
        throw new Error(data.error ?? "Could not save discovery action.");
      }

      if (action === "remove") {
        setCards((current) => current.filter((item) => item.id !== event.id));
        setToastEvent(event);
        return data;
      }

      if (action === "unremove") {
        setCards((current) =>
          events.filter((candidate) =>
            candidate.id === event.id || current.some((item) => item.id === candidate.id)
          )
        );
        setToastEvent(null);
        return data;
      }

      if (data.counts || data.state) {
        setCards((current) =>
          current.map((item) => {
            if (item.id !== event.id) {
              return item;
            }

            return {
              ...item,
              fire: data.counts?.fire ?? item.fire,
              fireSelected: data.state?.fire ?? item.fireSelected,
              going: data.counts?.going ?? item.going,
              goingSelected: data.state?.planning ?? item.goingSelected,
              songs: data.counts?.songs ?? item.songs,
            };
          })
        );
      }

      return data;
    } catch (error) {
      if (!options.silent) {
        setErrorMessage(error instanceof Error ? error.message : "Could not save discovery action.");
      }
      return null;
    } finally {
      if (!options.silent) {
        setPendingAction(null);
      }
    }
  }

  async function togglePositiveAction(
    event: FreshSandboxEvent,
    action: Extract<ActionKind, "fire" | "going">
  ) {
    clearTooltip();
    setToastEvent(null);
    await sendDiscoveryAction(event, action);
  }

  async function trackAvlgoClick(event: FreshSandboxEvent) {
    await sendDiscoveryAction(event, "avlgo_click", { silent: true, surface: "sandbox:fresh:avlgo" });
  }

  async function requestRemove(event: FreshSandboxEvent) {
    clearTooltip();

    if (skipConfirm) {
      await sendDiscoveryAction(event, "remove");
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

    const removed = await sendDiscoveryAction(confirmEvent, "remove");

    if (removed) {
      setConfirmEvent(null);
    }
  }

  function toggleReveal(eventId: string) {
    setRevealedEventId((current) => (current === eventId ? null : eventId));
  }

  return (
    <>
      <section className="sandbox-hero" id="discover">
        <div className="sandbox-header">
          <p className="eyebrow">Community pulse</p>
          <h1>Find the Asheville show worth talking about.</h1>
          <p className="lede">
            Real upcoming events from the DB, ranked into match cards and live social beats.
          </p>
          <div className="sandbox-search" role="search">
            <Search aria-hidden="true" size={17} strokeWidth={2.4} />
            <span>Search venues, artists, signals</span>
          </div>
        </div>

        <SocialDiscoveryBeats events={cards.slice(0, 6)} />
      </section>

      {errorMessage ? <p className="sandbox-error-message">{errorMessage}</p> : null}

      {cards.length > 0 ? (
        <section className="sandbox-layout" id="cards" aria-label="Music event card redesign">
          {cards.map((event) => (
            <FreshDiscoveryCard
              activeTooltip={activeTooltip}
              event={event}
              isPending={pendingAction?.startsWith(`${event.id}:`) ?? false}
              isRevealed={revealedEventId === event.id}
              key={event.id}
              onClearTooltip={clearTooltip}
              onQueueTooltip={queueTooltip}
              onRemove={requestRemove}
              onReveal={toggleReveal}
              onTrackAvlgoClick={trackAvlgoClick}
              onTogglePositiveAction={togglePositiveAction}
            />
          ))}
        </section>
      ) : (
        <section className="sandbox-empty-cards" id="cards" aria-label="Music event card redesign">
          <h2>All cards removed</h2>
          <p>
            Your discovery surface would now refill with lower-ranked events instead of showing these
            removed patterns again.
          </p>
          <button onClick={() => setCards(events)} type="button">
            Restore sandbox cards
          </button>
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
            Removed <strong>{toastEvent.title}</strong>. Similar signals will rank lower for you.
          </span>
          <button onClick={() => void sendDiscoveryAction(toastEvent, "unremove")} type="button">
            Undo
          </button>
        </div>
      ) : null}
    </>
  );
}

function FreshDiscoveryCard({
  activeTooltip,
  event,
  isPending,
  isRevealed,
  onClearTooltip,
  onQueueTooltip,
  onRemove,
  onReveal,
  onTogglePositiveAction,
  onTrackAvlgoClick,
}: {
  activeTooltip: ActiveTooltip | null;
  event: FreshSandboxEvent;
  isPending: boolean;
  isRevealed: boolean;
  onClearTooltip: () => void;
  onQueueTooltip: (eventId: string, action: ActionKind) => void;
  onRemove: (event: FreshSandboxEvent) => void;
  onReveal: (eventId: string) => void;
  onTogglePositiveAction: (
    event: FreshSandboxEvent,
    action: Extract<ActionKind, "fire" | "going">
  ) => void;
  onTrackAvlgoClick: (event: FreshSandboxEvent) => void;
}) {
  function handleCardClick(eventClick: React.MouseEvent<HTMLElement>) {
    if (isInteractiveTarget(eventClick.target)) {
      return;
    }

    onReveal(event.id);
  }

  function handleCardKeyDown(keyEvent: React.KeyboardEvent<HTMLElement>) {
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
        <span>{event.tag}</span>
        <strong>{event.match}% match</strong>
      </div>

      <div className="sandbox-card-body">
        <div className="sandbox-date">
          <span>{event.dayLabel}</span>
          <strong>{event.dateLabel}</strong>
        </div>
        <p className="card-kicker">{event.venue}</p>
        <h3>{event.title}</h3>
        <p className="event-meta">
          {event.time} · {event.artist}
        </p>
        <div className="sandbox-pulse" aria-label="Social pulse">
          <span className="avatar-stack" aria-hidden="true">
            <i>M</i>
            <i>J</i>
            <i>R</i>
          </span>
          <span>
            {event.going} planning · {event.songs} songs · {event.fire} fire
          </span>
        </div>
        <div className="sandbox-card-disclosure">
          <p className="sandbox-note">{event.note}</p>
          <div className="sandbox-card-links" aria-label="Event links">
            <Link href={event.detailHref}>Details</Link>
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
          ariaLabel={`Planning to go: ${event.going}`}
          eventId={event.id}
          isDisabled={isPending}
          isPressed={event.goingSelected}
          onClearTooltip={onClearTooltip}
          onClick={() => onTogglePositiveAction(event, "going")}
          onQueueTooltip={onQueueTooltip}
        >
          <CalendarCheck aria-hidden="true" size={16} strokeWidth={2.5} />
          <span>Going</span>
          <strong>{event.going}</strong>
        </ActionButton>
        <ActionButton
          action="fire"
          activeTooltip={activeTooltip}
          ariaLabel={`Fire: ${event.fire}`}
          eventId={event.id}
          isDisabled={isPending}
          isPressed={event.fireSelected}
          onClearTooltip={onClearTooltip}
          onClick={() => onTogglePositiveAction(event, "fire")}
          onQueueTooltip={onQueueTooltip}
        >
          <Flame aria-hidden="true" size={16} strokeWidth={2.5} />
          <span>Fire</span>
          <strong>{event.fire}</strong>
        </ActionButton>
        <ActionButton
          action="remove"
          activeTooltip={activeTooltip}
          ariaLabel="Remove from my listings"
          eventId={event.id}
          isDisabled={isPending}
          isPressed={false}
          onClearTooltip={onClearTooltip}
          onClick={() => onRemove(event)}
          onQueueTooltip={onQueueTooltip}
        >
          <X aria-hidden="true" size={18} strokeWidth={2.6} />
        </ActionButton>
      </div>
    </article>
  );
}

function EventPoster({ event }: { event: FreshSandboxEvent }) {
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
      <span>{event.initials}</span>
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
  children: React.ReactNode;
  eventId: string;
  isDisabled: boolean;
  isPressed: boolean;
  onClearTooltip: () => void;
  onClick: () => void;
  onQueueTooltip: (eventId: string, action: ActionKind) => void;
}) {
  const tooltipId = `sandbox-${eventId}-${action}-tooltip`;
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
  event: FreshSandboxEvent;
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

  function handleKeyDown(keyEvent: React.KeyboardEvent<HTMLElement>) {
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
        aria-labelledby="sandbox-remove-title"
        aria-modal="true"
        className="sandbox-remove-dialog"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <p className="eyebrow">Remove signal</p>
        <h2 id="sandbox-remove-title">Remove this event from your discovery?</h2>
        <p>
          <strong>{event.title}</strong> will hide from this surface. The personal discovery
          algorithm treats Remove as a negative signal for similar artists, venues, tags, and
          timing.
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

function SocialDiscoveryBeats({ events }: { events: FreshSandboxEvent[] }) {
  return (
    <aside className="sandbox-beats" id="beats" aria-label="Social Discovery Beats">
      <div className="sandbox-beats-header">
        <span className="sandbox-beats-title">
          <Headphones aria-hidden="true" size={15} strokeWidth={2.4} />
          <p className="eyebrow">Social Discovery Beats</p>
        </span>
        <strong>{events.length} live rows</strong>
      </div>
      <div className="sandbox-beat-list">
        {events.map((event, index) => (
          <Link className="sandbox-beat-tile" href={event.detailHref} key={event.id}>
            <span className={`sandbox-beat-thumb ${event.imageUrl ? "" : "is-fallback"}`} aria-hidden="true">
              {event.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" decoding="async" loading="lazy" src={event.imageUrl} />
              ) : null}
              <i>{event.initials}</i>
              <em>{index === 0 || event.fire > 0 ? "HOT" : "NEW"}</em>
            </span>
            <span className="sandbox-beat-copy">
              <strong>{event.title}</strong>
              <small>{event.time} · {event.venue}</small>
              <span>
                {event.match}% match · {event.going} planning · {event.fire} fire
              </span>
            </span>
            <ChevronRight aria-hidden="true" size={16} strokeWidth={2.4} />
          </Link>
        ))}
      </div>
    </aside>
  );
}

function isInteractiveTarget(target: EventTarget) {
  return target instanceof Element && Boolean(target.closest("a, button, input, label"));
}
