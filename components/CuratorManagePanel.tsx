"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSignInChooser } from "@/components/SignInChooser";

type ManagedPick = {
  id: string;
  eventId: string;
  eventTitle: string;
  note: string | null;
  artistName: string | null;
  venueName: string | null;
  status: "visible" | "hidden";
};

type MyCurator = {
  id: string;
  handle: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  status: "active" | "hidden" | "pending" | "rejected";
  picks: ManagedPick[];
  visiblePickCount: number;
  activated: boolean;
};

/** A slim upcoming-event shape the first-picks search selects from (PRD 32). */
export type PickableEvent = {
  id: string;
  title: string;
  venue: string | null;
  date: string | null;
};

type Flash = { kind: "idle" | "success" | "error" | "saving"; message: string };

/**
 * Curator self-management surface (PRD 31 / C3). Owner-only: drives the self-scoped
 * `/api/me/curator` plane to edit the caller's OWN persona and add / show-hide / remove their OWN
 * picks. Resolves the curator from the session — never another curator. Admin moderation overrides
 * (a non-active row is read-only here until an admin restores it).
 */
export function CuratorManagePanel({
  isSignedIn,
  upcomingEvents = [],
}: {
  isSignedIn: boolean;
  upcomingEvents?: PickableEvent[];
}) {
  const [loading, setLoading] = useState(true);
  const { chooser, openChooser } = useSignInChooser();
  const [curator, setCurator] = useState<MyCurator | null>(null);
  const [notCurator, setNotCurator] = useState(false);
  const [flash, setFlash] = useState<Flash>({ kind: "idle", message: "" });

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [handle, setHandle] = useState("");

  const [eventQuery, setEventQuery] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<PickableEvent | null>(null);
  const [newNote, setNewNote] = useState("");

  const applyCurator = useCallback((next: MyCurator) => {
    setCurator(next);
    setDisplayName(next.displayName);
    setBio(next.bio ?? "");
    setAvatarUrl(next.avatarUrl ?? "");
    setHandle(next.handle);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/me/curator", { cache: "no-store" });
      if (response.status === 401) {
        return;
      }
      if (response.status === 404) {
        setNotCurator(true);
        return;
      }
      const data = (await response.json()) as { curator?: MyCurator; error?: string };
      if (data.curator) applyCurator(data.curator);
    } catch {
      setFlash({ kind: "error", message: "Could not load your curator profile." });
    } finally {
      setLoading(false);
    }
  }, [applyCurator]);

  useEffect(() => {
    if (isSignedIn) void load();
    else setLoading(false);
  }, [isSignedIn, load]);

  async function savePersona() {
    setFlash({ kind: "saving", message: "Saving…" });
    try {
      const response = await fetch("/api/me/curator", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName, bio, avatarUrl, handle }),
      });
      const data = (await response.json()) as { curator?: MyCurator; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not save your profile.");
      setFlash({ kind: "success", message: "Profile saved." });
      // Persona PATCH returns the public persona; reload picks too to stay in sync.
      void load();
    } catch (error) {
      setFlash({ kind: "error", message: error instanceof Error ? error.message : "Could not save your profile." });
    }
  }

  async function addPick() {
    if (!selectedEvent) return;
    setFlash({ kind: "saving", message: "Adding pick…" });
    try {
      const response = await fetch("/api/me/curator", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: selectedEvent.id,
          eventTitle: selectedEvent.title,
          note: newNote.trim(),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not add the pick.");
      setSelectedEvent(null);
      setEventQuery("");
      setNewNote("");
      setFlash({ kind: "success", message: "Pick added." });
      void load();
    } catch (error) {
      setFlash({ kind: "error", message: error instanceof Error ? error.message : "Could not add the pick." });
    }
  }

  async function togglePick(pick: ManagedPick) {
    const nextStatus = pick.status === "visible" ? "hidden" : "visible";
    try {
      const response = await fetch("/api/me/curator", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: "pick", id: pick.id, status: nextStatus }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Could not update the pick.");
      }
      void load();
    } catch (error) {
      setFlash({ kind: "error", message: error instanceof Error ? error.message : "Could not update the pick." });
    }
  }

  async function removePick(pick: ManagedPick) {
    try {
      const response = await fetch("/api/me/curator", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: pick.id }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Could not remove the pick.");
      }
      void load();
    } catch (error) {
      setFlash({ kind: "error", message: error instanceof Error ? error.message : "Could not remove the pick." });
    }
  }

  if (!isSignedIn) {
    return (
      <div className="curator-apply-panel">
        <p>Sign in to manage your curator profile.</p>
        <button
          className="primary-action"
          type="button"
          onClick={() =>
            openChooser({
              callbackUrl: "/curators/manage",
              source: "curator-manage",
              heading: "Sign in to manage your picks",
            })
          }
        >
          Sign in
        </button>
        {chooser}
      </div>
    );
  }

  if (loading) return <p className="empty-copy">Loading…</p>;

  if (notCurator) {
    return (
      <div className="curator-apply-panel">
        <p>You&apos;re not a curator yet.</p>
        <Link className="primary-action" href="/curators/apply">
          Become a curator
        </Link>
      </div>
    );
  }

  if (!curator) {
    return <p className="form-message error">Could not load your curator profile.</p>;
  }

  const handleValid = /^[a-z0-9](?:[a-z0-9_-]{1,38}[a-z0-9])$/.test(handle.trim().toLowerCase());
  const moderated = curator.status !== "active";
  const pickedEventIds = new Set(curator.picks.map((pick) => pick.eventId));
  const query = eventQuery.trim().toLowerCase();
  const eventMatches = query
    ? upcomingEvents
        .filter((event) => !pickedEventIds.has(event.id))
        .filter((event) => `${event.title} ${event.venue ?? ""}`.toLowerCase().includes(query))
        .slice(0, 8)
    : [];

  return (
    <div className="curator-manage">
      {moderated ? (
        <p className="form-message error">
          This profile isn&apos;t active{curator.status === "pending" ? " (in review)" : ""}. An admin must
          {curator.status === "rejected" ? " approve" : " restore"} it before you can make changes.
        </p>
      ) : null}

      <section className="curator-apply-panel">
        <h2>Your persona</h2>
        <label className="curator-apply-field">
          <span>Handle</span>
          <input maxLength={40} onChange={(e) => setHandle(e.target.value)} value={handle} disabled={moderated} />
          {handle.trim() && !handleValid ? (
            <small className="form-message error">3–40 chars: lowercase letters, digits, - or _.</small>
          ) : (
            <small>
              Public URL: <code>/curator/{handle.trim().toLowerCase() || curator.handle}</code>
            </small>
          )}
        </label>
        <label className="curator-apply-field">
          <span>Display name</span>
          <input maxLength={80} onChange={(e) => setDisplayName(e.target.value)} value={displayName} disabled={moderated} />
        </label>
        <label className="curator-apply-field">
          <span>Bio</span>
          <textarea maxLength={600} onChange={(e) => setBio(e.target.value)} rows={3} value={bio} disabled={moderated} />
        </label>
        <label className="curator-apply-field">
          <span>Avatar URL</span>
          <input
            inputMode="url"
            maxLength={500}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://…"
            value={avatarUrl}
            disabled={moderated}
          />
          <small>Must be an https image URL.</small>
        </label>
        <div className="curator-apply-actions">
          <button
            className="primary-action"
            type="button"
            disabled={moderated || !handleValid || flash.kind === "saving"}
            onClick={() => void savePersona()}
          >
            Save profile
          </button>
          <Link className="ghost-control" href={`/curator/${encodeURIComponent(curator.handle)}`}>
            View public profile
          </Link>
        </div>
      </section>

      <section className="curator-apply-panel">
        <h2>Your picks</h2>
        {!moderated && !curator.activated ? (
          <p className="curator-apply-gate is-review">
            You have no visible picks yet — add your first show below to appear in the curator directory.
          </p>
        ) : null}
        {curator.picks.length === 0 ? (
          <p className="empty-copy">No picks yet. Add your first show below.</p>
        ) : (
          <ul className="curator-manage-picks">
            {curator.picks.map((pick) => (
              <li className="curator-manage-pick" key={pick.id} data-hidden={pick.status === "hidden"}>
                <div>
                  <strong>{pick.eventTitle || pick.artistName || "Show"}</strong>
                  {pick.venueName ? <small>{pick.venueName}</small> : null}
                  {pick.note ? <p className="curator-pick-note">“{pick.note}”</p> : null}
                  {pick.status === "hidden" ? <small className="curator-manage-hidden">Hidden</small> : null}
                </div>
                <div className="curator-apply-actions">
                  <button className="ghost-control" type="button" disabled={moderated} onClick={() => void togglePick(pick)}>
                    {pick.status === "visible" ? "Hide" : "Show"}
                  </button>
                  <button className="ghost-control" type="button" disabled={moderated} onClick={() => void removePick(pick)}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="curator-apply-field">
          <span>Add a pick</span>
          {selectedEvent ? (
            <div className="curator-pick-selected">
              <div>
                <strong>{selectedEvent.title}</strong>
                {selectedEvent.venue ? <small>{selectedEvent.venue}</small> : null}
              </div>
              <button
                className="ghost-control"
                type="button"
                onClick={() => {
                  setSelectedEvent(null);
                  setEventQuery("");
                }}
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <input
                onChange={(e) => setEventQuery(e.target.value)}
                placeholder="Search upcoming shows…"
                value={eventQuery}
                disabled={moderated}
              />
              {eventQuery.trim() ? (
                eventMatches.length > 0 ? (
                  <ul className="curator-event-results">
                    {eventMatches.map((event) => (
                      <li key={event.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedEvent(event);
                            setEventQuery("");
                          }}
                          disabled={moderated}
                        >
                          <strong>{event.title}</strong>
                          {event.venue ? <small>{event.venue}</small> : null}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <small className="empty-copy">No upcoming shows match “{eventQuery.trim()}”.</small>
                )
              ) : null}
            </>
          )}
          <input
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Why you're picking it (optional)"
            value={newNote}
            disabled={moderated}
          />
          <div className="curator-apply-actions">
            <button
              className="primary-action"
              type="button"
              disabled={moderated || !selectedEvent || flash.kind === "saving"}
              onClick={() => void addPick()}
            >
              Add pick
            </button>
          </div>
        </div>
      </section>

      {flash.message ? <p className={`form-message ${flash.kind === "saving" ? "notice" : flash.kind}`}>{flash.message}</p> : null}
    </div>
  );
}
