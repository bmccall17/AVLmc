"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type {
  CommunityCounts,
  ContributionType,
  EventIntentSource,
  PublicContribution,
  PublicEventCommunity,
  ReactionType,
} from "@/lib/community";
import type { CuratedBy } from "@/lib/curators-core";
import type { DiscoveryPersonEventState } from "@/lib/discovery-memory";
import type { SpotifyTrackSearchResult } from "@/lib/music";
import { SHARED_SONGS_REFRESH_EVENT } from "@/lib/shared-songs-core";

type EventSummary = {
  id: string;
  eventTitle: string;
  artistName: string;
};

type CommunityPanelProps = {
  /** Active curators who picked this show — rendered inside the Community Signal strip. */
  curatedBy?: CuratedBy[];
  event: EventSummary;
  initialDiscoveryState?: DiscoveryPersonEventState;
  initialCommunity: PublicEventCommunity;
  spotifySearchEnabled: boolean;
  /** Optional artist "top tracks" player, rendered between the Community signal strip and the Songs/Notes grid. */
  topTracksSlot?: ReactNode;
};

type FormState = {
  kind: "idle" | "success" | "error";
  message: string;
};

const emptyFormState: FormState = { kind: "idle", message: "" };

type EventActionResponse = {
  counts?: CommunityCounts;
  error?: string;
  state?: DiscoveryPersonEventState;
  /** True when this Fire/Going surfaced a visible curator pick (signed-in active curators only). */
  curatorPickAdded?: boolean;
};

export function CommunityPanel({
  curatedBy = [],
  event,
  initialDiscoveryState,
  initialCommunity,
  spotifySearchEnabled,
  topTracksSlot,
}: CommunityPanelProps) {
  const [community, setCommunity] = useState(initialCommunity);
  const [discoveryState, setDiscoveryState] = useState(
    initialDiscoveryState ?? emptyDiscoveryState(event.id)
  );
  const [songState, setSongState] = useState<FormState>(emptyFormState);
  const [noteState, setNoteState] = useState<FormState>(emptyFormState);
  const [reactionState, setReactionState] = useState<FormState>(emptyFormState);
  const [reactionPending, setReactionPending] =
    useState<ReactionType | EventIntentSource | "remove" | "unremove" | null>(null);
  const [songTitle, setSongTitle] = useState("");
  const [songArtist, setSongArtist] = useState(event.artistName);
  const [songUrl, setSongUrl] = useState("");
  const [spotifyQuery, setSpotifyQuery] = useState("");
  const [spotifyResults, setSpotifyResults] = useState<SpotifyTrackSearchResult[]>([]);
  const [spotifyPending, setSpotifyPending] = useState(false);
  const [selectedSpotifyTrack, setSelectedSpotifyTrack] = useState<SpotifyTrackSearchResult | null>(null);
  const detailTracked = useRef(false);

  const grouped = useMemo(
    () => ({
      songs: community.contributions.filter((item) => item.type === "song"),
      notes: community.contributions.filter((item) => item.type === "comment"),
    }),
    [community.contributions]
  );

  useEffect(() => {
    if (detailTracked.current) {
      return;
    }

    detailTracked.current = true;
    void fetch("/api/discovery/event-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "detail_open",
        eventId: event.id,
        surface: "detail",
      }),
    }).catch(() => undefined);
  }, [event.id]);

  async function react(type: ReactionType, source: EventIntentSource = "avlmc") {
    setReactionPending(source === "avlmc" ? type : source);

    try {
      const response = await fetch("/api/discovery/event-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: type === "fire" ? "fire" : "planning",
          eventId: event.id,
          intentSource: source,
          surface: "detail",
        }),
      });
      const data = (await response.json()) as EventActionResponse;

      if (!response.ok || !data.counts) {
        throw new Error(data.error ?? "Could not save reaction.");
      }

      setCommunity((current) => ({ ...current, ...data.counts }));
      if (data.state) {
        setDiscoveryState(data.state);
      }
      // Shared Listening (PRD 17): Going/Fire may have seeded the artist's tracks server-side;
      // nudge the SharedListening surface to re-fetch and reveal them.
      window.dispatchEvent(
        new CustomEvent(SHARED_SONGS_REFRESH_EVENT, { detail: { eventId: event.id } })
      );
      setReactionState({
        kind: "success",
        message: data.curatorPickAdded
          ? "Added to your curator picks."
          : getIntentMessage(type, source),
      });
    } catch (error) {
      setReactionState({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not save reaction.",
      });
    } finally {
      setReactionPending(null);
    }
  }

  async function toggleRemoved() {
    const action = discoveryState.removed ? "unremove" : "remove";
    setReactionPending(action);

    try {
      const response = await fetch("/api/discovery/event-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          eventId: event.id,
          surface: "detail",
        }),
      });
      const data = (await response.json()) as EventActionResponse;

      if (!response.ok || !data.state) {
        throw new Error(data.error ?? "Could not update this listing.");
      }

      setDiscoveryState(data.state);
      if (data.counts) {
        setCommunity((current) => ({ ...current, ...data.counts }));
      }
      setReactionState({
        kind: "success",
        message: data.state.removed ? "Removed from your homepage." : "Restored to your homepage.",
      });
    } catch (error) {
      setReactionState({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not update this listing.",
      });
    } finally {
      setReactionPending(null);
    }
  }

  async function submitSong(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const form = formEvent.currentTarget;
    const data = new FormData(form);

    await submitJsonContribution(
      {
        type: "song",
        displayName: getFormValue(data, "displayName"),
        bodyText: getFormValue(data, "bodyText"),
        songTitle: getFormValue(data, "songTitle"),
        songArtist: getFormValue(data, "songArtist"),
        songUrl: getFormValue(data, "songUrl"),
        musicProvider: selectedSpotifyTrack?.provider ?? "",
        musicProviderItemId: selectedSpotifyTrack?.providerItemId ?? "",
        musicProviderUrl: selectedSpotifyTrack?.externalUrl ?? "",
        website: getFormValue(data, "website"),
      },
      setSongState,
      form
    );
  }

  async function searchSpotifyTracks() {
    const normalizedQuery = spotifyQuery.trim();

    if (normalizedQuery.length < 2) {
      setSongState({ kind: "error", message: "Enter at least 2 characters to search Spotify." });
      return;
    }

    setSpotifyPending(true);
    setSongState({ kind: "idle", message: "Searching Spotify..." });

    try {
      const response = await fetch(`/api/me/spotify-tracks?q=${encodeURIComponent(normalizedQuery)}`);
      const data = (await response.json()) as { tracks?: SpotifyTrackSearchResult[]; error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not search Spotify.");
      }

      setSpotifyResults(data.tracks ?? []);
      setSongState({
        kind: "success",
        message: data.tracks?.length ? "Pick a Spotify track below." : "No Spotify tracks found.",
      });
    } catch (error) {
      setSpotifyResults([]);
      setSongState({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not search Spotify.",
      });
    } finally {
      setSpotifyPending(false);
    }
  }

  function selectSpotifyTrack(track: SpotifyTrackSearchResult) {
    setSelectedSpotifyTrack(track);
    setSongTitle(track.name);
    setSongArtist(track.artistNames.join(", "));
    setSongUrl(track.externalUrl);
    setSongState({ kind: "success", message: "Spotify track selected." });
  }

  async function submitNote(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const form = formEvent.currentTarget;
    const data = new FormData(form);

    await submitJsonContribution(
      {
        type: "comment",
        displayName: getFormValue(data, "displayName"),
        bodyText: getFormValue(data, "bodyText"),
        website: getFormValue(data, "website"),
      },
      setNoteState,
      form
    );
  }

  async function submitJsonContribution(
    values: Partial<Record<string, string>> & { type: ContributionType },
    setState: (state: FormState) => void,
    form: HTMLFormElement
  ) {
    setState({ kind: "idle", message: "Saving..." });

    try {
      const response = await fetch("/api/community/contributions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          eventId: event.id,
          eventTitle: event.eventTitle,
        }),
      });
      const data = (await response.json()) as { community?: PublicEventCommunity; error?: string };

      if (!response.ok || !data.community) {
        throw new Error(data.error ?? "Could not save contribution.");
      }

      setCommunity(data.community);
      form.reset();
      if (values.type === "song") {
        setSongTitle("");
        setSongArtist(event.artistName);
        setSongUrl("");
        setSelectedSpotifyTrack(null);
        setSpotifyQuery("");
        setSpotifyResults([]);
      }
      setState({ kind: "success", message: "Added." });
    } catch (error) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not save contribution.",
      });
    }
  }

  return (
    <section className="community-panel" aria-label="Community contributions">
      <div className="reaction-strip">
        <div>
          <p className="eyebrow">Community signal</p>
          <h2>Who is leaning in?</h2>
          <CuratedByLine curators={curatedBy} />
        </div>
        <button
          className="reaction-button"
          disabled={reactionPending === "going"}
          onClick={() => react("going")}
          title="Count yourself in — adds you to the thinking-of-going tally"
          type="button"
        >
          {community.going} thinking of going
        </button>
        {spotifySearchEnabled ? (
          <button
            className="reaction-button spotify-intent"
            disabled={reactionPending === "spotify"}
            onClick={() => react("going", "spotify")}
            title="Counts you as thinking of going, tagged with your Spotify connection — different from bookmarking the show"
            type="button"
          >
            Going via Spotify
          </button>
        ) : null}
        <button
          className="reaction-button hot"
          disabled={reactionPending === "fire"}
          onClick={() => react("fire")}
          title="Hype this show — adds a fire reaction"
          type="button"
        >
          {community.fire} fire
        </button>
        <button
          className={`reaction-button remove ${discoveryState.removed ? "is-active" : ""}`}
          disabled={reactionPending === "remove" || reactionPending === "unremove"}
          onClick={toggleRemoved}
          title={
            discoveryState.removed
              ? "Bring this show back onto your homepage"
              : "Hide this show from your homepage"
          }
          type="button"
        >
          {discoveryState.removed ? "Show on my list" : "Remove from my list"}
        </button>
      </div>

      <div className="intent-source-row" aria-label="Saved signal sources">
        <span>{community.goingSources.avlmc} AVLmc</span>
        {community.goingSources.spotify > 0 ? (
          <span className="spotify-source">{community.goingSources.spotify} Spotify</span>
        ) : null}
        {community.goingSources.ticket_click > 0 ? (
          <span>{community.goingSources.ticket_click} ticket clicks</span>
        ) : null}
      </div>

      <FormMessage state={reactionState} />

      {topTracksSlot}

      <div className="contribution-grid">
        <ContributionList empty="No songs yet." items={grouped.songs} title={`Songs (${community.songs})`} />
        <ContributionList empty="No notes yet." items={grouped.notes} title={`Notes (${community.notes})`} />
      </div>

      <div className="community-form-grid">
        <form className="community-form" onSubmit={submitSong}>
          <h3>Recommend a song</h3>
          {spotifySearchEnabled ? (
            <div className="spotify-picker">
              <label>
                Spotify search
                <input
                  onChange={(inputEvent) => setSpotifyQuery(inputEvent.target.value)}
                  placeholder="Search Spotify tracks"
                  type="search"
                  value={spotifyQuery}
                />
              </label>
              <button disabled={spotifyPending} onClick={searchSpotifyTracks} type="button">
                Search Spotify
              </button>
              {spotifyResults.length > 0 ? (
                <div className="spotify-results">
                  {spotifyResults.map((track) => (
                    <button
                      key={track.providerItemId}
                      onClick={() => selectSpotifyTrack(track)}
                      type="button"
                    >
                      <strong>{track.name}</strong>
                      <span>{track.artistNames.join(", ")}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <label>
            Song title
            <input
              maxLength={140}
              name="songTitle"
              onChange={(inputEvent) => setSongTitle(inputEvent.target.value)}
              required
              value={songTitle}
            />
          </label>
          <label>
            Artist
            <input
              maxLength={140}
              name="songArtist"
              onChange={(inputEvent) => setSongArtist(inputEvent.target.value)}
              value={songArtist}
            />
          </label>
          <label>
            Music link
            <input
              name="songUrl"
              onChange={(inputEvent) => {
                setSongUrl(inputEvent.target.value);
                if (selectedSpotifyTrack && inputEvent.target.value !== selectedSpotifyTrack.externalUrl) {
                  setSelectedSpotifyTrack(null);
                }
              }}
              placeholder="Spotify, YouTube, Bandcamp, Apple Music..."
              required
              type="url"
              value={songUrl}
            />
          </label>
          {selectedSpotifyTrack ? (
            <p className="form-help">Linked from Spotify.</p>
          ) : null}
          <label>
            Optional note
            <textarea maxLength={600} name="bodyText" rows={3} />
          </label>
          <label>
            Display name
            <input maxLength={64} name="displayName" placeholder="Optional" />
          </label>
          <input className="hp-field" name="website" tabIndex={-1} />
          <button className="primary-action" type="submit">
            Add song
          </button>
          <FormMessage state={songState} />
        </form>

        <form className="community-form" onSubmit={submitNote}>
          <h3>Leave a local note</h3>
          <label>
            Note
            <textarea maxLength={600} name="bodyText" required rows={7} />
          </label>
          <label>
            Display name
            <input maxLength={64} name="displayName" placeholder="Optional" />
          </label>
          <input className="hp-field" name="website" tabIndex={-1} />
          <button className="primary-action" type="submit">
            Add note
          </button>
          <FormMessage state={noteState} />
        </form>
      </div>
    </section>
  );
}

/**
 * "Curated by" credit inside the Community Signal strip. With 1–2 curators, show linked names;
 * with 3+, collapse to avatar chips (hover for the name) to keep the strip compact.
 */
function CuratedByLine({ curators }: { curators: CuratedBy[] }) {
  if (curators.length === 0) {
    return null;
  }

  return (
    <p className="curated-by-inline" aria-label="Curated by">
      <span className="curated-by-inline-label">★ Curated by</span>
      {curators.length > 2 ? (
        <span className="curated-by-avatars">
          {curators.map((curator) => (
            <Link
              className="curated-by-avatar"
              href={`/curator/${encodeURIComponent(curator.handle)}`}
              key={curator.handle}
              title={curator.displayName}
            >
              {curator.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- remote persona avatars have no size/domain guarantees.
                <img alt={curator.displayName} src={curator.avatarUrl} />
              ) : (
                <span aria-hidden="true">{curator.displayName.charAt(0).toUpperCase()}</span>
              )}
            </Link>
          ))}
        </span>
      ) : (
        curators.map((curator, index) => (
          <span key={curator.handle}>
            {index > 0 ? ", " : null}
            <Link href={`/curator/${encodeURIComponent(curator.handle)}`}>{curator.displayName}</Link>
          </span>
        ))
      )}
    </p>
  );
}

function ContributionList({
  empty,
  items,
  title,
}: {
  empty: string;
  items: PublicContribution[];
  title: string;
}) {
  return (
    <section className="contribution-list">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="empty-copy">{empty}</p>
      ) : (
        items.map((item) => <ContributionCard contribution={item} key={item.id} />)
      )}
    </section>
  );
}

function ContributionCard({ contribution: initialContribution }: { contribution: PublicContribution }) {
  const [contribution, setContribution] = useState(initialContribution);
  const [isEditing, setIsEditing] = useState(false);
  const [editBody, setEditBody] = useState(contribution.bodyText ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/community/contributions/${contribution.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bodyText: editBody }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to save edit.");
      if (data.contribution) {
        setContribution({ ...contribution, ...data.contribution, isOwner: contribution.isOwner });
        setIsEditing(false);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : "Failed to save edit.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <article className="contribution-card">
      <div className="contribution-meta">
        <strong>
          {contribution.curatorHandle ? (
            <Link href={`/curator/${encodeURIComponent(contribution.curatorHandle)}`}>
              {contribution.displayName}
            </Link>
          ) : (
            contribution.displayName || "Anonymous"
          )}
        </strong>
        <span>
          {formatCreatedAt(contribution.createdAt)}
          {contribution.isOwner && !isEditing ? (
            <>
              {" · "}
              <button
                type="button"
                className="ghost-control"
                onClick={() => setIsEditing(true)}
                style={{ padding: 0, height: "auto", fontSize: "inherit", fontWeight: "normal", color: "var(--foreground)" }}
              >
                Edit
              </button>
            </>
          ) : null}
        </span>
      </div>
      {contribution.type === "song" ? (
        <>
          <a href={contribution.songUrl ?? "#"} target="_blank">
            {contribution.songTitle}
          </a>
          {contribution.musicProvider ? (
            <span className="provider-pill">{formatProvider(contribution.musicProvider)}</span>
          ) : null}
          {contribution.songArtist ? <p>{contribution.songArtist}</p> : null}
        </>
      ) : null}
      {isEditing ? (
        <form onSubmit={handleSave} className="community-form" style={{ marginTop: 12 }}>
          <textarea
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            disabled={isSubmitting}
            required
            rows={3}
            style={{ width: "100%" }}
          />
          <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
            <button type="submit" className="primary-action" disabled={isSubmitting}>
              Save
            </button>
            <button
              type="button"
              className="ghost-control"
              onClick={() => {
                setEditBody(contribution.bodyText ?? "");
                setIsEditing(false);
              }}
              disabled={isSubmitting}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        contribution.bodyText ? <p>{contribution.bodyText}</p> : null
      )}
    </article>
  );
}

function FormMessage({ state }: { state: FormState }) {
  if (!state.message) {
    return null;
  }

  return <p className={`form-message ${state.kind}`}>{state.message}</p>;
}

function emptyDiscoveryState(eventId: string): DiscoveryPersonEventState {
  return {
    eventId,
    fire: false,
    fireAt: null,
    planning: false,
    planningAt: null,
    removed: false,
    removedAt: null,
  };
}

function getIntentMessage(type: ReactionType, source: EventIntentSource) {
  if (type === "fire") {
    return "Added fire.";
  }
  if (source === "spotify") {
    return "Saved via Spotify signal.";
  }
  if (source === "ticket_click") {
    return "Ticket interest saved.";
  }
  return "Thinking of going saved.";
}

function getFormValue(data: FormData, key: string) {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatProvider(provider: string) {
  return provider === "spotify" ? "Spotify" : provider;
}
