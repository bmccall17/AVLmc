"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { CalendarCheck, ChevronRight, Flame, Headphones, Search, X } from "lucide-react";

export type SandboxEvent = {
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
  image: string;
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

type ActiveTooltip = {
  action: ActionKind;
  eventId: string;
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
    impact:
      "Adds heat to the community signal and can lift the show in social discovery rows.",
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

export function SandboxDiscoveryExperience({ events }: { events: SandboxEvent[] }) {
  const [visibleEvents, setVisibleEvents] = useState(events);
  const [activeTooltip, setActiveTooltip] = useState<ActiveTooltip | null>(null);
  const [confirmEvent, setConfirmEvent] = useState<SandboxEvent | null>(null);
  const [skipConfirm, setSkipConfirm] = useState(false);
  const [skipFutureConfirm, setSkipFutureConfirm] = useState(false);
  const [toastEvent, setToastEvent] = useState<SandboxEvent | null>(null);
  const tooltipTimer = useRef<number | null>(null);

  useEffect(() => {
    setVisibleEvents(events);
  }, [events]);

  useEffect(() => {
    setSkipConfirm(window.localStorage.getItem(SKIP_REMOVE_CONFIRM_KEY) === "true");

    return () => {
      if (tooltipTimer.current) {
        window.clearTimeout(tooltipTimer.current);
      }
    };
  }, []);

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

  function togglePositiveAction(eventId: string, action: Extract<ActionKind, "fire" | "going">) {
    clearTooltip();
    setToastEvent(null);
    setVisibleEvents((current) =>
      current.map((event) => {
        if (event.id !== eventId) {
          return event;
        }

        if (action === "going") {
          return {
            ...event,
            going: Math.max(0, event.going + (event.goingSelected ? -1 : 1)),
            goingSelected: !event.goingSelected,
          };
        }

        return {
          ...event,
          fire: Math.max(0, event.fire + (event.fireSelected ? -1 : 1)),
          fireSelected: !event.fireSelected,
        };
      })
    );
  }

  function requestRemove(event: SandboxEvent) {
    clearTooltip();

    if (skipConfirm) {
      removeEvent(event);
      return;
    }

    setSkipFutureConfirm(false);
    setConfirmEvent(event);
  }

  function confirmRemove() {
    if (!confirmEvent) {
      return;
    }

    if (skipFutureConfirm) {
      window.localStorage.setItem(SKIP_REMOVE_CONFIRM_KEY, "true");
      setSkipConfirm(true);
    }

    removeEvent(confirmEvent);
    setConfirmEvent(null);
  }

  function removeEvent(event: SandboxEvent) {
    setVisibleEvents((current) => current.filter((item) => item.id !== event.id));
    setToastEvent(event);
  }

  function undoRemove(event: SandboxEvent) {
    setVisibleEvents((current) =>
      events.filter((candidate) => candidate.id === event.id || current.some((item) => item.id === candidate.id))
    );
    setToastEvent(null);
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

        <SocialDiscoveryBeats events={visibleEvents.slice(0, 6)} />
      </section>

      {visibleEvents.length > 0 ? (
        <section className="sandbox-layout" id="cards" aria-label="Music event card redesign">
          {visibleEvents.map((event) => (
            <SandboxCard
              activeTooltip={activeTooltip}
              event={event}
              key={event.id}
              onClearTooltip={clearTooltip}
              onQueueTooltip={queueTooltip}
              onRemove={requestRemove}
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
          <button onClick={() => setVisibleEvents(events)} type="button">
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
          <button onClick={() => undoRemove(toastEvent)} type="button">
            Undo
          </button>
        </div>
      ) : null}
    </>
  );
}

function SandboxCard({
  activeTooltip,
  event,
  onClearTooltip,
  onQueueTooltip,
  onRemove,
  onTogglePositiveAction,
}: {
  activeTooltip: ActiveTooltip | null;
  event: SandboxEvent;
  onClearTooltip: () => void;
  onQueueTooltip: (eventId: string, action: ActionKind) => void;
  onRemove: (event: SandboxEvent) => void;
  onTogglePositiveAction: (eventId: string, action: Extract<ActionKind, "fire" | "going">) => void;
}) {
  return (
    <article className="sandbox-event-card" tabIndex={0}>
      <div className="sandbox-art" style={{ background: event.image }} aria-hidden="true">
        <span>{event.initials}</span>
      </div>

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
        <p className="sandbox-note">{event.note}</p>
      </div>

      <div className="sandbox-action-bar" aria-label="Discovery actions">
        <ActionButton
          action="going"
          activeTooltip={activeTooltip}
          ariaLabel={`Planning to go: ${event.going}`}
          eventId={event.id}
          isPressed={event.goingSelected}
          onClearTooltip={onClearTooltip}
          onClick={() => onTogglePositiveAction(event.id, "going")}
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
          isPressed={event.fireSelected}
          onClearTooltip={onClearTooltip}
          onClick={() => onTogglePositiveAction(event.id, "fire")}
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

function ActionButton({
  action,
  activeTooltip,
  ariaLabel,
  children,
  eventId,
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
  event: SandboxEvent;
  onCancel: () => void;
  onConfirm: () => void;
  onSkipFutureChange: (value: boolean) => void;
  skipFuture: boolean;
}) {
  return (
    <div className="sandbox-dialog-backdrop">
      <section
        aria-labelledby="sandbox-remove-title"
        aria-modal="true"
        className="sandbox-remove-dialog"
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

function SocialDiscoveryBeats({ events }: { events: SandboxEvent[] }) {
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
            <span className="sandbox-beat-thumb" style={{ background: event.image }} aria-hidden="true">
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
