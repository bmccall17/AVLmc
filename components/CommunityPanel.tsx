"use client";

import { FormEvent, useMemo, useState } from "react";
import type {
  CommunityCounts,
  ContributionType,
  PublicContribution,
  PublicEventCommunity,
  ReactionType,
} from "@/lib/community";

type EventSummary = {
  id: string;
  eventTitle: string;
  artistName: string;
};

type CommunityPanelProps = {
  event: EventSummary;
  initialCommunity: PublicEventCommunity;
};

type FormState = {
  kind: "idle" | "success" | "error";
  message: string;
};

const emptyFormState: FormState = { kind: "idle", message: "" };

export function CommunityPanel({ event, initialCommunity }: CommunityPanelProps) {
  const [community, setCommunity] = useState(initialCommunity);
  const [songState, setSongState] = useState<FormState>(emptyFormState);
  const [noteState, setNoteState] = useState<FormState>(emptyFormState);
  const [reactionState, setReactionState] = useState<FormState>(emptyFormState);
  const [reactionPending, setReactionPending] = useState<ReactionType | null>(null);

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
        website: getFormValue(data, "website"),
      },
      setSongState,
      form
    );
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
          <label>
            Song title
            <input maxLength={140} name="songTitle" required />
          </label>
          <label>
            Artist
            <input defaultValue={event.artistName} maxLength={140} name="songArtist" />
          </label>
          <label>
            Music link
            <input name="songUrl" placeholder="Spotify, YouTube, Bandcamp, Apple Music..." required type="url" />
          </label>
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
