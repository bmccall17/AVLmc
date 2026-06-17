"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";

/** Mirror of the server `MyCuratorStatus` shape (PRD 29) — only the fields this form reads. */
type MyCuratorStatus = {
  status: "none" | "active" | "hidden" | "pending" | "rejected";
  handle?: string;
  displayName?: string;
  bio?: string | null;
  note?: string | null;
};

type ApplyResponse = {
  myStatus?: MyCuratorStatus;
  selfServeOpen?: boolean;
  error?: string;
};

type FormState = { kind: "idle" | "saving" | "error" | "success"; message: string };

const BIO_MAX = 600;
const NOTE_MAX = 600;

/**
 * Guided curator apply flow (PRD 30 / C2). A signed-in listener authors their persona and submits
 * to the C1 `POST /api/me/curator-application`; the gate decides instant promotion vs. admin review.
 * Anonymous visitors get a sign-in nudge that returns them here. Already-active curators are shown a
 * "manage" affordance (C3), never the form. Applications are private — nothing here is public.
 */
export function CuratorApplyForm({ isSignedIn }: { isSignedIn: boolean }) {
  const [loading, setLoading] = useState(true);
  const [selfServeOpen, setSelfServeOpen] = useState(false);
  const [myStatus, setMyStatus] = useState<MyCuratorStatus>({ status: "none" });
  const [form, setForm] = useState<FormState>({ kind: "idle", message: "" });

  const [handle, setHandle] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [note, setNote] = useState("");

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/me/curator-application", { cache: "no-store" });
      if (response.status === 401) {
        setMyStatus({ status: "none" });
        return;
      }
      const data = (await response.json()) as ApplyResponse;
      setSelfServeOpen(Boolean(data.selfServeOpen));
      const status = data.myStatus ?? { status: "none" };
      setMyStatus(status);
      // Pre-fill from an existing draft/application so a re-submit edits rather than starts over.
      if (status.handle) setHandle(status.handle);
      if (status.displayName) setDisplayName(status.displayName);
      if (status.bio) setBio(status.bio);
      if (status.note) setNote(status.note);
    } catch {
      setForm({ kind: "error", message: "Could not load your curator status. Try again." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSignedIn) {
      void loadStatus();
    } else {
      setLoading(false);
    }
  }, [isSignedIn, loadStatus]);

  async function submit() {
    setForm({ kind: "saving", message: "Submitting…" });
    try {
      const response = await fetch("/api/me/curator-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handle: handle.trim(),
          displayName: displayName.trim(),
          bio: bio.trim(),
          avatarUrl: avatarUrl.trim(),
          note: note.trim(),
        }),
      });
      const data = (await response.json()) as ApplyResponse;
      if (!response.ok || !data.myStatus) {
        throw new Error(data.error ?? "Could not submit your application.");
      }
      setMyStatus(data.myStatus);
      setForm({
        kind: "success",
        message:
          data.myStatus.status === "active"
            ? "You're a curator! Your profile is live."
            : "Application received — an admin will review it shortly.",
      });
    } catch (error) {
      setForm({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not submit your application.",
      });
    }
  }

  if (!isSignedIn) {
    return (
      <div className="curator-apply-panel">
        <p>Sign in to apply to become a curator. Your application is private — only you and an admin can see it.</p>
        <button
          className="primary-action"
          type="button"
          onClick={() => void signIn("spotify", { callbackUrl: "/curators/apply" })}
        >
          Sign in to apply
        </button>
      </div>
    );
  }

  if (loading) {
    return <p className="empty-copy">Loading…</p>;
  }

  // Fresh submit result. Instant promotion hands off to first picks (C4); a queued one explains review.
  if (form.kind === "success") {
    return (
      <div className="curator-apply-panel">
        <p className="form-message success">{form.message}</p>
        <div className="curator-apply-actions">
          {myStatus.status === "active" ? (
            <>
              <Link className="primary-action" href="/curators/manage">
                Add your first picks
              </Link>
              {myStatus.handle ? (
                <Link className="ghost-control" href={`/curator/${encodeURIComponent(myStatus.handle)}`}>
                  View your profile
                </Link>
              ) : null}
            </>
          ) : (
            <Link className="ghost-control" href="/curators">
              Back to curators
            </Link>
          )}
        </div>
      </div>
    );
  }

  // Already a curator (instant promotion or admin-promoted) — hand off to self-management (C3).
  if (myStatus.status === "active") {
    return (
      <div className="curator-apply-panel">
        <p>
          You&apos;re already a curator{myStatus.handle ? <> — <strong>@{myStatus.handle}</strong></> : null}.
        </p>
        <div className="curator-apply-actions">
          <Link className="primary-action" href="/curators/manage">
            Manage my profile &amp; picks
          </Link>
          {myStatus.handle ? (
            <Link className="ghost-control" href={`/curator/${encodeURIComponent(myStatus.handle)}`}>
              View your profile
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  if (myStatus.status === "pending") {
    return (
      <div className="curator-apply-panel">
        <p>Your curator application is <strong>in review</strong>. An admin will approve it soon — hang tight.</p>
        <Link className="ghost-control" href="/curators">
          Back to curators
        </Link>
      </div>
    );
  }

  const handleValid = /^[a-z0-9](?:[a-z0-9_-]{1,38}[a-z0-9])$/.test(handle.trim().toLowerCase());
  const canSubmit = handleValid && form.kind !== "saving";

  return (
    <form
      className="curator-apply-panel curator-apply-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) void submit();
      }}
    >
      <p className={`curator-apply-gate ${selfServeOpen ? "is-open" : "is-review"}`}>
        {selfServeOpen
          ? "Curators go live instantly right now — submit and your profile is public."
          : "An admin reviews new curators right now — you'll be notified once approved."}
      </p>

      <label className="curator-apply-field">
        <span>Handle</span>
        <input
          autoComplete="off"
          maxLength={40}
          name="handle"
          onChange={(event) => setHandle(event.target.value)}
          placeholder="dj-nyla"
          value={handle}
        />
        <small>
          3–40 chars: lowercase letters, digits, <code>-</code> or <code>_</code>. This is your public
          URL: <code>/curator/{handle.trim().toLowerCase() || "your-handle"}</code>.
        </small>
        {handle.trim() && !handleValid ? (
          <small className="form-message error">
            Handle must be 3–40 chars: lowercase letters, digits, - or _ (start and end alphanumeric).
          </small>
        ) : null}
      </label>

      <label className="curator-apply-field">
        <span>Display name</span>
        <input
          maxLength={80}
          name="displayName"
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="DJ Nyla"
          value={displayName}
        />
        <small>Shown on your profile. Defaults to your handle if left blank.</small>
      </label>

      <label className="curator-apply-field">
        <span>Bio</span>
        <textarea
          maxLength={BIO_MAX}
          name="bio"
          onChange={(event) => setBio(event.target.value)}
          placeholder="What you're into and why people should follow your picks."
          rows={3}
          value={bio}
        />
        <small>{bio.length}/{BIO_MAX}</small>
      </label>

      <label className="curator-apply-field">
        <span>Avatar URL (optional)</span>
        <input
          inputMode="url"
          maxLength={500}
          name="avatarUrl"
          onChange={(event) => setAvatarUrl(event.target.value)}
          placeholder="https://…"
          value={avatarUrl}
        />
        <small>Must be an https image URL. Leave blank to use a default.</small>
      </label>

      <label className="curator-apply-field">
        <span>Why do you want to curate? (optional)</span>
        <textarea
          maxLength={NOTE_MAX}
          name="note"
          onChange={(event) => setNote(event.target.value)}
          placeholder="A short pitch — only you and an admin see this."
          rows={3}
          value={note}
        />
        <small>Private to you and an admin. {note.length}/{NOTE_MAX}</small>
      </label>

      <div className="curator-apply-actions">
        <button className="primary-action" disabled={!canSubmit} type="submit">
          {selfServeOpen ? "Become a curator" : "Submit for review"}
        </button>
        <Link className="ghost-control" href="/curators">
          Cancel
        </Link>
      </div>

      {form.message && form.kind !== "saving" ? (
        <p className={`form-message ${form.kind}`}>{form.message}</p>
      ) : form.kind === "saving" ? (
        <p className="form-message notice">{form.message}</p>
      ) : null}
    </form>
  );
}
