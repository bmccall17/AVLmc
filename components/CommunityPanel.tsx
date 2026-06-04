"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
  const [sessionId, setSessionId] = useState("");
  const [songState, setSongState] = useState<FormState>(emptyFormState);
  const [noteState, setNoteState] = useState<FormState>(emptyFormState);
  const [voiceState, setVoiceState] = useState<FormState>(emptyFormState);
  const [reactionPending, setReactionPending] = useState<ReactionType | null>(null);
  const [recorder, setRecorder] = useState<MediaRecorder | null>(null);
  const [recordedFile, setRecordedFile] = useState<File | null>(null);
  const [recordedSeconds, setRecordedSeconds] = useState<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSessionId(getSessionId());
  }, []);

  const grouped = useMemo(
    () => ({
      songs: community.contributions.filter((item) => item.type === "song"),
      notes: community.contributions.filter((item) => item.type === "comment"),
      voices: community.contributions.filter((item) => item.type === "voice"),
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
          sessionId: sessionId || getSessionId(),
          type,
        }),
      });
      const data = (await response.json()) as { counts?: CommunityCounts; error?: string };

      if (!response.ok || !data.counts) {
        throw new Error(data.error ?? "Could not save reaction.");
      }

      setCommunity((current) => ({ ...current, ...data.counts }));
    } catch (error) {
      setVoiceState({
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

  async function submitVoice(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const form = formEvent.currentTarget;
    const data = new FormData(form);
    const upload = data.get("audio");
    const audioFile = recordedFile ?? (upload instanceof File && upload.size ? upload : null);

    if (!audioFile) {
      setVoiceState({ kind: "error", message: "Record or upload an audio memo first." });
      return;
    }

    const durationSeconds = recordedSeconds ?? (await getAudioDuration(audioFile));
    if (durationSeconds && durationSeconds > 60) {
      setVoiceState({ kind: "error", message: "Voice memos must be 60 seconds or shorter." });
      return;
    }

    setVoiceState({ kind: "idle", message: "Uploading voice memo..." });

    try {
      const payload = new FormData();
      payload.set("eventId", event.id);
      payload.set("eventTitle", event.eventTitle);
      payload.set("type", "voice");
      payload.set("sessionId", sessionId || getSessionId());
      payload.set("displayName", getFormValue(data, "displayName"));
      payload.set("durationSeconds", String(durationSeconds ?? ""));
      payload.set("website", getFormValue(data, "website"));
      payload.set("audio", audioFile);

      const response = await fetch("/api/community/contributions", {
        method: "POST",
        body: payload,
      });
      const result = (await response.json()) as {
        community?: PublicEventCommunity;
        error?: string;
      };

      if (!response.ok || !result.community) {
        throw new Error(result.error ?? "Could not save voice memo.");
      }

      setCommunity(result.community);
      setRecordedFile(null);
      setRecordedSeconds(null);
      form.reset();
      setVoiceState({ kind: "success", message: "Voice memo added." });
    } catch (error) {
      setVoiceState({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not save voice memo.",
      });
    }
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
          sessionId: sessionId || getSessionId(),
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

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setVoiceState({ kind: "error", message: "Recording is not available in this browser." });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      chunksRef.current = [];
      startedAtRef.current = Date.now();

      mediaRecorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      });
      mediaRecorder.addEventListener("stop", () => {
        const duration = startedAtRef.current
          ? Math.ceil((Date.now() - startedAtRef.current) / 1000)
          : null;
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType || "audio/webm" });
        const file = new File([blob], `voice-memo-${Date.now()}.webm`, { type: blob.type });
        stream.getTracks().forEach((track) => track.stop());
        setRecordedFile(file);
        setRecordedSeconds(duration ? Math.min(duration, 60) : null);
        setVoiceState({ kind: "success", message: "Recording ready to submit." });
      });

      mediaRecorder.start();
      setRecorder(mediaRecorder);
      setRecordedFile(null);
      setRecordedSeconds(null);
      setVoiceState({ kind: "idle", message: "Recording... max 60 seconds." });
      timeoutRef.current = setTimeout(() => {
        if (mediaRecorder.state !== "inactive") {
          mediaRecorder.stop();
          setRecorder(null);
        }
      }, 60000);
    } catch {
      setVoiceState({ kind: "error", message: "Microphone access was not available." });
    }
  }

  function stopRecording() {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    setRecorder(null);
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

        <form className="community-form" onSubmit={submitVoice}>
          <h3>Voice memo</h3>
          <p className="form-help">Record up to 60 seconds, or upload an audio file up to 3 MB.</p>
          <div className="record-controls">
            {recorder ? (
              <button className="reaction-button hot" onClick={stopRecording} type="button">
                Stop recording
              </button>
            ) : (
              <button className="reaction-button" onClick={startRecording} type="button">
                Record memo
              </button>
            )}
            {recordedFile ? <span>{recordedSeconds ?? "New"} sec memo ready</span> : null}
          </div>
          <label>
            Upload fallback
            <input accept="audio/*" name="audio" type="file" />
          </label>
          <label>
            Display name
            <input maxLength={64} name="displayName" placeholder="Optional" />
          </label>
          <input className="hp-field" name="website" tabIndex={-1} />
          <button className="primary-action" type="submit">
            Add voice memo
          </button>
          <FormMessage state={voiceState} />
        </form>
      </div>

      <div className="contribution-grid">
        <ContributionList empty="No songs yet." items={grouped.songs} title={`Songs (${community.songs})`} />
        <ContributionList empty="No notes yet." items={grouped.notes} title={`Notes (${community.notes})`} />
        <ContributionList empty="No voice memos yet." items={grouped.voices} title={`Voice memos (${community.voices})`} />
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
      {contribution.type === "voice" && contribution.audioUrl ? (
        <audio controls preload="none" src={contribution.audioUrl} />
      ) : null}
    </article>
  );
}

function FormMessage({ state }: { state: FormState }) {
  if (!state.message) {
    return null;
  }

  return <p className={`form-message ${state.kind}`}>{state.message}</p>;
}

function getSessionId() {
  const key = "avl-show-notes-session";
  const existing = window.localStorage.getItem(key);
  if (existing) {
    return existing;
  }

  const next =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(key, next);
  return next;
}

function getFormValue(data: FormData, key: string) {
  const value = data.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getAudioDuration(file: File) {
  return new Promise<number | null>((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    const done = (duration: number | null) => {
      URL.revokeObjectURL(url);
      resolve(duration);
    };

    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      done(Number.isFinite(audio.duration) ? Math.ceil(audio.duration) : null);
    };
    audio.onerror = () => done(null);
    audio.src = url;
  });
}

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
