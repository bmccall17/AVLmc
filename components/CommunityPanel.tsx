"use client";

import { FormEvent, useMemo, useState } from "react";
import type {
  CommunityCounts,
  ContributionType,
  PublicContribution,
  PublicEventCommunity,
  ReactionType,
} from "@/lib/community";
import type { SpotifyTrackSearchResult } from "@/lib/music";

type EventSummary = {
  id: string;
  eventTitle: string;
  artistName: string;
};

type CommunityPanelProps = {
  event: EventSummary;
  initialCommunity: PublicEventCommunity;
  spotifySearchEnabled: boolean;
};

type FormState = {
  kind: "idle" | "success" | "error";
  message: string;
};

const emptyFormState: FormState = { kind: "idle", message: "" };

export function CommunityPanel({ event, initialCommunity, spotifySearchEnabled }: CommunityPanelProps) {
  const [community, setCommunity] = useState(initialCommunity);
  const [songState, setSongState] = useState<FormState>(emptyFormState);
  const [noteState, setNoteState] = useState<FormState>(emptyFormState);
  const [reactionState, setReactionState] = useState<FormState>(emptyFormState);
  const [reactionPending, setReactionPending] = useState<ReactionType | null>(null);
  const [songTitle, setSongTitle] = useState("");
  const [songArtist, setSongArtist] = useState(event.artistName);
  const [songUrl, setSongUrl] = useState("");
  const [spotifyQuery, setSpotifyQuery] = useState("");
  const [spotifyResults, setSpotifyResults] = useState<SpotifyTrackSearchResult[]>([]);
  const [spotifyPending, setSpotifyPending] = useState(false);
  const [selectedSpotifyTrack, setSelectedSpotifyTrack] = useState<SpotifyTrackSearchResult | null>(null);

  const grouped = useMemo(
    () => ({
      songs: community.contributions.filter((item) => item.type === "song"),
      notes: community.contributions.filter((item) => item.type === "comment"),
    }),
    [community.contributions]
  );

  async function react(type: ReactionType) {
    setReactionPending(type);

    try {
      const response = await fetch("/api/community/reactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId: event.id,
          eventTitle: event.eventTitle,
          type,
        }),
      });
      const data = (await response.json()) as { counts?: CommunityCounts; error?: string };

      if (!response.ok || !data.counts) {
        throw new Error(data.error ?? "Could not save reaction.");
      }

      setCommunity((current) => ({ ...current, ...data.counts }));
    } catch (error) {
      setReactionState({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not save reaction.",
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
        </div>
        <button
          className="reaction-button"
          disabled={reactionPending === "going"}
          onClick={() => react("going")}
          type="button"
        >
          {community.going} thinking of going
        </button>
        <button
          className="reaction-button hot"
          disabled={reactionPending === "fire"}
          onClick={() => react("fire")}
          type="button"
        >
          {community.fire} fire
        </button>
      </div>

      <FormMessage state={reactionState} />

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

      <div className="contribution-grid">
        <ContributionList empty="No songs yet." items={grouped.songs} title={`Songs (${community.songs})`} />
        <ContributionList empty="No notes yet." items={grouped.notes} title={`Notes (${community.notes})`} />
      </div>
    </section>
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

function ContributionCard({ contribution }: { contribution: PublicContribution }) {
  return (
    <article className="contribution-card">
      <div className="contribution-meta">
        <strong>{contribution.displayName || "Anonymous"}</strong>
        <span>{formatCreatedAt(contribution.createdAt)}</span>
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
          {contribution.bodyText ? <p>{contribution.bodyText}</p> : null}
        </>
      ) : null}
      {contribution.type === "comment" ? <p>{contribution.bodyText}</p> : null}
    </article>
  );
}

function FormMessage({ state }: { state: FormState }) {
  if (!state.message) {
    return null;
  }

  return <p className={`form-message ${state.kind}`}>{state.message}</p>;
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
