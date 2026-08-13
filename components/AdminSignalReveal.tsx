"use client";

import { useCallback, useState } from "react";
import { useIsAdmin } from "@/lib/use-admin-reveal";
import type { EventSignalActor, EventSignalAttribution } from "@/lib/community";

type SignalKind = "going" | "fire";

// Per-event attribution is fetched once on first hover and shared across ticks.
const cache = new Map<string, Promise<EventSignalAttribution>>();

function loadAttribution(eventId: string): Promise<EventSignalAttribution> {
  let pending = cache.get(eventId);
  if (!pending) {
    pending = fetch(`/api/admin/event-signals?eventId=${encodeURIComponent(eventId)}`, {
      credentials: "same-origin",
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`event-signals ${res.status}`);
        }
        return res.json() as Promise<EventSignalAttribution>;
      })
      .catch((error) => {
        cache.delete(eventId); // allow a retry on the next hover
        throw error;
      });
    cache.set(eventId, pending);
  }
  return pending;
}

const SOURCE_LABEL: Record<EventSignalActor["source"], string> = {
  avlmc: "GOING button",
  spotify: "Spotify",
  ticket_click: "Source click",
  fire: "Fire",
};

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ActorLine({ actor }: { actor: EventSignalActor }) {
  const who = actor.guest ? "Guest" : actor.name?.trim() || actor.email || "Signed-in user";
  // Spans only (no ul/li/div): these ticks live inside <button>, which may only
  // contain phrasing content — block elements would be invalid and break hydration.
  return (
    <span className="admin-reveal-actor">
      <span className="admin-reveal-actor-name">{who}</span>
      {!actor.guest && actor.email ? (
        <span className="admin-reveal-actor-email">{actor.email}</span>
      ) : null}
      <span className="admin-reveal-actor-meta">
        {SOURCE_LABEL[actor.source]} · {formatWhen(actor.createdAt)}
      </span>
    </span>
  );
}

/**
 * Wraps a Going/Fire tick count. For admins, hovering reveals who is behind the tick
 * (name/email/source/time), fetched from the admin-gated /api/admin/event-signals.
 * For everyone else it renders children unchanged — no fetch, no affordance.
 */
export function AdminSignalReveal({
  eventId,
  kind,
  children,
}: {
  eventId: string;
  kind: SignalKind;
  children: React.ReactNode;
}) {
  const isAdmin = useIsAdmin();
  const [open, setOpen] = useState(false);
  const [actors, setActors] = useState<EventSignalActor[] | null>(null);
  const [error, setError] = useState(false);

  const reveal = useCallback(() => {
    setOpen(true);
    if (actors !== null) {
      return;
    }
    loadAttribution(eventId)
      .then((data) => setActors(data[kind]))
      .catch(() => setError(true));
  }, [actors, eventId, kind]);

  if (!isAdmin) {
    return <>{children}</>;
  }

  return (
    <span
      className="admin-reveal"
      onMouseEnter={reveal}
      onMouseLeave={() => setOpen(false)}
      onFocus={reveal}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open ? (
        <span className="admin-reveal-tooltip" role="tooltip">
          {error ? (
            <span className="admin-reveal-empty">Couldn&apos;t load attribution</span>
          ) : actors === null ? (
            <span className="admin-reveal-empty">Loading…</span>
          ) : actors.length === 0 ? (
            <span className="admin-reveal-empty">No {kind} signals yet</span>
          ) : (
            <span className="admin-reveal-list">
              {actors.map((actor, index) => (
                <ActorLine actor={actor} key={`${actor.email ?? "guest"}-${index}`} />
              ))}
            </span>
          )}
        </span>
      ) : null}
    </span>
  );
}
