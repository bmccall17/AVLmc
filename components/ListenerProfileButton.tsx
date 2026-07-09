"use client";

import { signIn, signOut } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Bookmark, Camera, Plus, RotateCcw, SlidersHorizontal, Star, Trash2, Upload, Users, X } from "lucide-react";
import { MusicConnectionActions } from "@/components/MusicConnectionActions";
import { SpotifyGateButton } from "@/components/SignInChooser";
import { SpotifyAccessRequest } from "@/components/SpotifyAccessRequest";
import type { AuthFeatureFlags } from "@/lib/auth-flags";
import type { DiscoveryScoreComponents } from "@/lib/discovery";
import {
  DEFAULT_LISTENER_DISCOVERY_PREFERENCES,
  LISTENER_PREFERENCE_CHANGE_EVENT,
  LISTENER_PREFERENCE_CONTROLS,
  LISTENER_PREFERENCE_STORAGE_KEY,
  normalizeListenerPreferences,
  type ListenerCustomSignalDirection,
  type ListenerCustomSignalKind,
  type ListenerDiscoveryPreferences,
  type ListenerPreferenceKey,
  type ListenerPreferenceWeights,
} from "@/lib/listener-preferences";
import type { MusicConnection, MusicProfileItem } from "@/lib/music";
import { SPOTIFY_LIMITED_BETA_MESSAGE } from "@/lib/spotify-limited-access";

export type ListenerScorePreview = {
  components: DiscoveryScoreComponents;
  eventTitle: string;
  matchPercent: number;
  reasons: string[];
};

type ListenerProfileButtonProps = {
  features: AuthFeatureFlags;
  hasTasteProfile: boolean;
  initialPreferences: ListenerDiscoveryPreferences;
  musicConnections: MusicConnection[];
  musicProfileItems: MusicProfileItem[];
  scorePreview: ListenerScorePreview | null;
  spotifyLimitedBetaNotice: boolean;
  user: {
    email: string | null | undefined;
    id: string;
    image: string | null | undefined;
    name: string | null | undefined;
  } | null;
};

type ActionState = {
  kind: "idle" | "success" | "notice" | "error";
  message: string;
};

const CUSTOM_SIGNAL_KIND_LABELS: Record<ListenerCustomSignalKind, string> = {
  artist: "Artist",
  keyword: "Keyword",
  tag: "Tag",
  venue: "Venue",
};

type ListenerModalSection = "tune" | "boosts" | "sharing" | "why" | "account";

const MODAL_SECTIONS: Array<{ id: ListenerModalSection; label: string }> = [
  { id: "tune", label: "Tune" },
  { id: "boosts", label: "Boosts" },
  { id: "sharing", label: "Sharing & Privacy" },
  { id: "why", label: "Why these shows" },
  { id: "account", label: "Account & sources" },
];

type ListenerPreset = {
  description: string;
  id: string;
  name: string;
  /**
   * Preset weights intentionally leave `socialCircle` alone — "your people" influence is a consent
   * dial the listener turns on explicitly (PRD 26), so no preset should flip it.
   */
  weights: Omit<ListenerPreferenceWeights, "socialCircle">;
};

const LISTENER_PRESETS: ListenerPreset[] = [
  {
    description: "Leans into novelty and fresh listings you haven't seen.",
    id: "discover",
    name: "🧭 Discover more",
    weights: {
      artistAffinity: 70,
      genreMatch: 80,
      venuePreference: 80,
      dateAvailability: 100,
      socialHeat: 90,
      localRelevance: 100,
      novelty: 170,
      freePaidPreference: 100,
      outdoorIndoorPreference: 100,
    },
  },
  {
    description: "Weights artists and genres you already love.",
    id: "familiar",
    name: "❤️ Familiar favorites",
    weights: {
      artistAffinity: 170,
      genreMatch: 150,
      venuePreference: 130,
      dateAvailability: 100,
      socialHeat: 100,
      localRelevance: 100,
      novelty: 40,
      freePaidPreference: 100,
      outdoorIndoorPreference: 100,
    },
  },
  {
    description: "Prioritizes Asheville venues and hometown acts.",
    id: "local",
    name: "📍 Local focus",
    weights: {
      artistAffinity: 90,
      genreMatch: 90,
      venuePreference: 150,
      dateAvailability: 100,
      socialHeat: 120,
      localRelevance: 180,
      novelty: 90,
      freePaidPreference: 100,
      outdoorIndoorPreference: 100,
    },
  },
];

export function ListenerProfileButton({
  features,
  hasTasteProfile,
  initialPreferences,
  musicConnections,
  musicProfileItems,
  scorePreview,
  spotifyLimitedBetaNotice,
  user,
}: ListenerProfileButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<ListenerModalSection>("tune");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [importState, setImportState] = useState<ActionState>({ kind: "idle", message: "" });
  const [isImporting, setIsImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarUrl, setAvatarUrl] = useState(user?.image ?? null);
  const [avatarState, setAvatarState] = useState<ActionState>({ kind: "idle", message: "" });
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [savedPreferences, setSavedPreferences] = useState(() =>
    normalizeListenerPreferences(initialPreferences)
  );
  const [draftPreferences, setDraftPreferences] = useState(() =>
    normalizeListenerPreferences(initialPreferences)
  );
  const [newSignalLabel, setNewSignalLabel] = useState("");
  const [newSignalKind, setNewSignalKind] = useState<ListenerCustomSignalKind>("artist");
  const [newSignalDirection, setNewSignalDirection] =
    useState<ListenerCustomSignalDirection>("boost");
  const [saveState, setSaveState] = useState<ActionState>({ kind: "idle", message: "" });
  const [isSaving, setIsSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [emailState, setEmailState] = useState<ActionState>({ kind: "idle", message: "" });
  const [accountLinks, setAccountLinks] = useState<{
    providers: { provider: string; type: string }[];
    emails: { email: string; source: string; verified: boolean; isPrimary: boolean }[];
  } | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const spotifyConnection = musicConnections.find((connection) => connection.provider === "spotify");
  const spotifyConnected = Boolean(spotifyConnection && !spotifyConnection.disconnectedAt);
  const spotifyTastePaused = Boolean(spotifyConnection?.tasteOptOutAt);
  const signalCount = musicProfileItems.length;
  const previewItems = musicProfileItems.slice(0, 6);
  const isSignedIn = Boolean(user?.id);
  const accountEmails = accountLinks?.emails ?? [];
  const accountEmail =
    accountEmails.find((entry) => entry.isPrimary)?.email ??
    accountEmails[0]?.email ??
    user?.email ??
    "";
  // Any verified email on the account is a working magic-link sign-in identifier (the Email provider
  // does not create an `accounts` row, so email sign-in can't be read from `accounts` — it's the
  // presence of a verified email that matters). PRD 35 posture: resolves to the same account, no
  // takeover surface. We surface this as an affirmative "enabled" state, not a perpetual connect CTA.
  const emailSignInEnabled =
    isSignedIn && (accountEmails.some((entry) => entry.verified) || Boolean(accountEmail));
  const secondaryEmails = accountEmails.filter((entry) => entry.email !== accountEmail);
  const profileLabel = isSignedIn ? "Signed in listener" : "Personalize your board";
  const profileDetail = isSignedIn
    ? signalCount > 0
      ? `${signalCount} taste signals`
      : "Manage discovery"
    : features.email
      ? "Sign in with email, or tune locally"
      : "Tune your board locally";
  const sourceStatus = getSourceStatus({
    connected: spotifyConnected,
    connection: spotifyConnection,
    paused: spotifyTastePaused,
  });
  const topComponents = useMemo(() => getTopComponents(scorePreview?.components), [scorePreview]);

  useEffect(() => {
    const nextPreferences = normalizeListenerPreferences(initialPreferences);

    setSavedPreferences(nextPreferences);
    setDraftPreferences(nextPreferences);
  }, [initialPreferences]);

  // Keep the local avatar in sync when the server re-renders with a fresh image (e.g. after a
  // provider sign-in refresh) so the optimistic upload state doesn't go stale.
  useEffect(() => {
    setAvatarUrl(user?.image ?? null);
  }, [user?.image]);

  function setContributionVisibility(visibility: "anonymous" | "followers" | "everyone") {
    const nextPreferences = normalizeListenerPreferences(draftPreferences);
    nextPreferences.contributionVisibility = visibility;
    setDraftPreferences(nextPreferences);
  }

  useEffect(() => {
    if (isSignedIn) {
      return;
    }

    const storedPreferences = window.localStorage.getItem(LISTENER_PREFERENCE_STORAGE_KEY);

    if (!storedPreferences) {
      return;
    }

    try {
      const nextPreferences = normalizeListenerPreferences(JSON.parse(storedPreferences));
      setSavedPreferences(nextPreferences);
      setDraftPreferences(nextPreferences);
      dispatchPreferenceChange(nextPreferences);
    } catch {
      window.localStorage.removeItem(LISTENER_PREFERENCE_STORAGE_KEY);
    }
  }, [isSignedIn]);

  useEffect(() => {
    if (isOpen) {
      closeButtonRef.current?.focus();
    }
  }, [isOpen]);

  // When a signed-in listener opens the profile, learn which sign-in methods + emails their account
  // already has, so we can offer an email sign-in method to Spotify-first users who lack one (PRD 35).
  useEffect(() => {
    if (!isOpen || !isSignedIn) {
      return;
    }
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/me/account-links", { cache: "no-store" });
        if (response.ok && active) {
          setAccountLinks(
            (await response.json()) as {
              providers: { provider: string; type: string }[];
              emails: { email: string; source: string; verified: boolean; isPrimary: boolean }[];
            }
          );
        }
      } catch {
        // Best-effort: if this fails, the add-email affordance just won't show.
      }
    })();
    return () => {
      active = false;
    };
  }, [isOpen, isSignedIn]);

  const activePresetId = useMemo(
    () =>
      LISTENER_PRESETS.find((preset) =>
        Object.entries(preset.weights).every(
          ([key, value]) => draftPreferences.weights[key as ListenerPreferenceKey] === value
        )
      )?.id ?? null,
    [draftPreferences.weights]
  );

  function applyPreset(preset: ListenerPreset) {
    setDraftPreferences((current) =>
      normalizeListenerPreferences({
        ...current,
        weights: {
          ...current.weights,
          ...preset.weights,
        },
      })
    );
    setSaveState({ kind: "idle", message: "" });
  }

  function updateWeight(key: ListenerPreferenceKey, value: number) {
    setDraftPreferences((current) =>
      normalizeListenerPreferences({
        ...current,
        weights: {
          ...current.weights,
          [key]: value,
        },
      })
    );
    setSaveState({ kind: "idle", message: "" });
  }

  function setShareActivity(shareActivity: boolean) {
    setDraftPreferences((current) =>
      normalizeListenerPreferences({
        ...current,
        shareActivity,
      })
    );
    setSaveState({ kind: "idle", message: "" });
  }

  function addCustomSignal() {
    const label = newSignalLabel.trim();

    if (!label) {
      return;
    }

    setDraftPreferences((current) =>
      normalizeListenerPreferences({
        ...current,
        customSignals: [
          ...current.customSignals,
          {
            direction: newSignalDirection,
            id: createSignalId(),
            kind: newSignalKind,
            label,
            weight: 24,
          },
        ],
      })
    );
    setNewSignalLabel("");
    setSaveState({ kind: "idle", message: "" });
  }

  function removeCustomSignal(id: string) {
    setDraftPreferences((current) =>
      normalizeListenerPreferences({
        ...current,
        customSignals: current.customSignals.filter((signal) => signal.id !== id),
      })
    );
    setSaveState({ kind: "idle", message: "" });
  }

  function updateCustomSignalWeight(id: string, weight: number) {
    setDraftPreferences((current) =>
      normalizeListenerPreferences({
        ...current,
        customSignals: current.customSignals.map((signal) =>
          signal.id === id ? { ...signal, weight } : signal
        ),
      })
    );
    setSaveState({ kind: "idle", message: "" });
  }

  async function savePreferences() {
    const nextPreferences = normalizeListenerPreferences(draftPreferences);
    setIsSaving(true);
    setSaveState({ kind: "idle", message: "Saving..." });

    try {
      if (isSignedIn) {
        const response = await fetch("/api/me/listener-preferences", {
          body: JSON.stringify({ preferences: nextPreferences }),
          headers: { "Content-Type": "application/json" },
          method: "PUT",
        });
        const data = (await response.json()) as {
          error?: string;
          preferences?: ListenerDiscoveryPreferences;
        };

        if (!response.ok) {
          throw new Error(data.error ?? "Could not save listener preferences.");
        }

        const saved = normalizeListenerPreferences(data.preferences ?? nextPreferences);
        setSavedPreferences(saved);
        setDraftPreferences(saved);
        dispatchPreferenceChange(saved);
      } else {
        const saved = {
          ...nextPreferences,
          updatedAt: new Date().toISOString(),
        };
        window.localStorage.setItem(LISTENER_PREFERENCE_STORAGE_KEY, JSON.stringify(saved));
        setSavedPreferences(saved);
        setDraftPreferences(saved);
        dispatchPreferenceChange(saved);
      }

      setSaveState({ kind: "success", message: "Listener settings saved." });
    } catch (error) {
      setSaveState({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not save listener preferences.",
      });
    } finally {
      setIsSaving(false);
    }
  }

  function resetDraft() {
    setDraftPreferences(DEFAULT_LISTENER_DISCOVERY_PREFERENCES);
    setSaveState({ kind: "notice", message: "Defaults ready. Save to apply them." });
  }

  async function importTasteFile(file: File) {
    setIsImporting(true);
    setImportState({ kind: "notice", message: `Reading ${file.name}…` });

    try {
      const csvText = await file.text();
      const response = await fetch("/api/me/taste-import", {
        body: csvText,
        headers: { "Content-Type": "text/csv" },
        method: "POST",
      });
      const data = (await response.json()) as {
        error?: string;
        imported?: number;
        preview?: string[];
      };

      if (!response.ok) {
        throw new Error(data.error ?? "Could not import that file.");
      }

      const preview = data.preview?.slice(0, 6).join(", ");
      setImportState({
        kind: "success",
        message: `Imported ${data.imported ?? 0} artists${preview ? ` — ${preview}…` : ""}. Your board is re-ranking.`,
      });
      // Re-run the server component so the newly imported taste re-ranks the board immediately.
      router.refresh();
    } catch (error) {
      setImportState({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not import that file.",
      });
    } finally {
      setIsImporting(false);
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
    }
  }

  async function uploadAvatar(file: File) {
    if (!file.type.startsWith("image/")) {
      setAvatarState({ kind: "error", message: "Choose an image file (JPG, PNG, WEBP, or GIF)." });
      return;
    }
    setIsUploadingAvatar(true);
    setAvatarState({ kind: "notice", message: "Uploading your photo…" });
    try {
      const response = await fetch("/api/me/avatar", {
        body: file,
        headers: { "Content-Type": file.type },
        method: "POST",
      });
      const data = (await response.json()) as { error?: string; image?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not upload that photo.");
      }
      setAvatarUrl(data.image ?? null);
      setAvatarState({ kind: "success", message: "Photo updated." });
      router.refresh();
    } catch (error) {
      setAvatarState({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not upload that photo.",
      });
    } finally {
      setIsUploadingAvatar(false);
      if (avatarInputRef.current) {
        avatarInputRef.current.value = "";
      }
    }
  }

  async function removeAvatar() {
    setIsUploadingAvatar(true);
    setAvatarState({ kind: "notice", message: "Removing your photo…" });
    try {
      const response = await fetch("/api/me/avatar", { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not remove that photo.");
      }
      setAvatarUrl(null);
      setAvatarState({ kind: "success", message: "Photo removed." });
      router.refresh();
    } catch (error) {
      setAvatarState({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not remove that photo.",
      });
    } finally {
      setIsUploadingAvatar(false);
    }
  }

  async function sendEmailLink(targetEmail?: string) {
    const trimmed = (targetEmail ?? email).trim();
    if (!trimmed) {
      return;
    }
    setEmailState({ kind: "notice", message: "Sending your sign-in link…" });

    try {
      const result = (await signIn("resend", {
        email: trimmed,
        redirect: false,
        callbackUrl: "/",
      })) as { error?: string } | undefined;

      if (result?.error) {
        throw new Error(result.error);
      }
      setEmailState({
        kind: "success",
        message:
          "Check your inbox for a one-tap sign-in link from avlmc@agent828.com — it may take a minute, and check your spam folder if you don't see it.",
      });
    } catch {
      setEmailState({ kind: "error", message: "Could not send the link. Try again in a moment." });
    }
  }

  function handleDialogKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <>
      <button
        aria-haspopup="dialog"
        aria-label={isSignedIn ? "Open listener profile" : "Open listener tuning"}
        className="sandbox-profile listener-profile-trigger"
        onClick={() => {
          setActiveSection("tune");
          setShowAdvanced(false);
          setIsOpen(true);
        }}
        type="button"
      >
        <ProfileAvatar imageUrl={avatarUrl} name={user?.name ?? "Listener"} />
        <span>
          <strong>{profileLabel}</strong>
          <small>{profileDetail}</small>
        </span>
      </button>

      {isOpen ? (
        <div
          className="listener-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsOpen(false);
            }
          }}
        >
          <section
            aria-labelledby="listener-profile-title"
            aria-modal="true"
            className="listener-modal"
            onKeyDown={handleDialogKeyDown}
            role="dialog"
          >
            <div className="listener-modal-header">
              <div className="listener-identity">
                <ProfileAvatar imageUrl={avatarUrl} name={user?.name ?? "Listener"} />
                <div>
                  <p className="eyebrow">My Asheville music compass</p>
                  <h2 id="listener-profile-title">{profileLabel}</h2>
                  <p>{user?.name ?? user?.email ?? "Tune this browser's discovery profile."}</p>
                  {isSignedIn ? (
                    <div className="listener-avatar-controls">
                      <input
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            void uploadAvatar(file);
                          }
                        }}
                        ref={avatarInputRef}
                        style={{ display: "none" }}
                        type="file"
                      />
                      <button
                        className="listener-avatar-control"
                        disabled={isUploadingAvatar}
                        onClick={() => avatarInputRef.current?.click()}
                        type="button"
                      >
                        <Camera aria-hidden="true" size={14} strokeWidth={2.4} />
                        {isUploadingAvatar ? "Working…" : avatarUrl ? "Change photo" : "Add photo"}
                      </button>
                      {avatarUrl ? (
                        <button
                          className="listener-avatar-control"
                          disabled={isUploadingAvatar}
                          onClick={() => void removeAvatar()}
                          type="button"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {avatarState.message ? (
                    <p className={`form-message ${avatarState.kind}`}>{avatarState.message}</p>
                  ) : null}
                </div>
              </div>
              <button
                aria-label="Close listener profile"
                className="listener-icon-button"
                onClick={() => setIsOpen(false)}
                ref={closeButtonRef}
                type="button"
              >
                <X aria-hidden="true" size={18} strokeWidth={2.6} />
              </button>
            </div>

            {!isSignedIn && (features.google || features.email) ? (
              <div className="listener-guest-cta">
                <div className="listener-guest-copy">
                  <strong>Save your tuning — sign in</strong>
                  <p>
                    Your dials work right now, in this browser. Sign in to keep them across devices
                    and let the board learn your taste over time. No password, no Spotify required.
                  </p>
                </div>
                <div className="listener-guest-actions">
                  {features.google ? (
                    <button
                      className="ghost-control"
                      onClick={() => void signIn("google", { callbackUrl: "/" })}
                      type="button"
                    >
                      Continue with Google
                    </button>
                  ) : null}
                  {features.email ? (
                    <div className="listener-email-row">
                      <input
                        aria-label="Email for a one-tap sign-in link"
                        autoComplete="email"
                        inputMode="email"
                        onChange={(event) => setEmail(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void sendEmailLink();
                          }
                        }}
                        placeholder="you@example.com"
                        type="email"
                        value={email}
                      />
                      <button
                        className="primary-action"
                        disabled={!email.trim() || emailState.kind === "notice"}
                        onClick={() => void sendEmailLink()}
                        type="button"
                      >
                        Email me a link
                      </button>
                    </div>
                  ) : null}
                </div>
                {emailState.message ? (
                  <p className={`form-message ${emailState.kind}`}>{emailState.message}</p>
                ) : null}
              </div>
            ) : null}

            <div className="listener-modal-body">
              <nav aria-label="Listener settings sections" className="listener-modal-nav">
                {MODAL_SECTIONS.map((section) => (
                  <button
                    aria-current={activeSection === section.id ? "page" : undefined}
                    className={activeSection === section.id ? "on" : undefined}
                    key={section.id}
                    onClick={() => setActiveSection(section.id)}
                    type="button"
                  >
                    {section.label}
                  </button>
                ))}
              </nav>

              <div className="listener-modal-content">

              {activeSection === "account" ? (
              <section className="listener-panel">
                <div className="listener-panel-heading">
                  <SlidersHorizontal aria-hidden="true" size={18} strokeWidth={2.4} />
                  <div>
                    <h3>Music source</h3>
                    <p>{sourceStatus}</p>
                  </div>
                </div>
                <dl className="listener-source-list">
                  <div>
                    <dt>Active source</dt>
                    <dd>{spotifyConnected ? "Spotify" : isSignedIn ? "No connected source" : "Guest tuning"}</dd>
                  </div>
                  <div>
                    <dt>Last sync</dt>
                    <dd>{spotifyConnection?.lastSyncedAt ? formatDateTime(spotifyConnection.lastSyncedAt) : "Not synced"}</dd>
                  </div>
                  <div>
                    <dt>Imported signals</dt>
                    <dd>{signalCount}</dd>
                  </div>
                  <div>
                    <dt>Personalization</dt>
                    <dd>{spotifyTastePaused ? "Spotify paused" : hasTasteProfile ? "Best Match active" : "Tuning active"}</dd>
                  </div>
                </dl>

                {previewItems.length > 0 ? (
                  <div className="listener-signal-preview" aria-label="Imported taste signals">
                    {previewItems.map((item) => (
                      <span key={item.id}>
                        {item.itemType === "top_artist" ? "Artist" : "Track"}: {item.name}
                      </span>
                    ))}
                  </div>
                ) : spotifyConnected ? (
                  <p className="empty-copy">Spotify is connected. Sync once to import taste signals.</p>
                ) : null}

                <div className="listener-source-actions">
                  {spotifyLimitedBetaNotice ? (
                    isSignedIn ? (
                      <SpotifyAccessRequest accountEmail={user?.email} />
                    ) : (
                      <p className="form-message notice">{SPOTIFY_LIMITED_BETA_MESSAGE}</p>
                    )
                  ) : null}

                  {spotifyConnected ? (
                    <MusicConnectionActions tasteOptedOut={spotifyTastePaused} />
                  ) : features.spotify ? (
                    <div className="listener-spotify-optional">
                      {/* Gated (PRD 43): approved accounts pass straight through; everyone else
                          gets the request path here instead of Spotify's 403. */}
                      <SpotifyGateButton
                        callbackUrl="/"
                        className="ghost-control"
                        source="listener-profile"
                      >
                        Connect Spotify (optional)
                      </SpotifyGateButton>
                      <small>
                        Imports your top artists/tracks for sharper matches. Currently
                        <strong> invite-only beta</strong> — taste import only works for approved accounts;
                        everything else works without it.
                      </small>
                    </div>
                  ) : null}
                  {isSignedIn ? (
                    <div className="listener-spotify-optional">
                      <input
                        accept=".csv,text/csv"
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) {
                            void importTasteFile(file);
                          }
                        }}
                        ref={importInputRef}
                        style={{ display: "none" }}
                        type="file"
                      />
                      <button
                        className="ghost-control"
                        disabled={isImporting}
                        onClick={() => importInputRef.current?.click()}
                        type="button"
                      >
                        <Upload aria-hidden="true" size={15} strokeWidth={2.4} />
                        {isImporting ? "Importing…" : "Import Spotify taste (CSV)"}
                      </button>
                      <small>
                        No seat, no waiting: export your playlists at{" "}
                        <a href="https://exportify.net" rel="noreferrer" target="_blank">
                          exportify.net
                        </a>{" "}
                        (sign in with Spotify, download the CSV), then upload it here to seed your board
                        from artists you already love.
                      </small>
                      {importState.message ? (
                        <p className={`form-message ${importState.kind}`}>{importState.message}</p>
                      ) : null}
                    </div>
                  ) : null}
                  {emailSignInEnabled && accountEmail ? (
                    <div className="listener-spotify-optional">
                      <p className="form-message success">
                        <strong>Email sign-in is on.</strong> A one-tap magic link to{" "}
                        <strong>{accountEmail}</strong> always signs you back into this same account — no
                        password, no Spotify required.
                      </p>
                      {secondaryEmails.length > 0 ? (
                        <small>
                          Also linked: {secondaryEmails.map((entry) => entry.email).join(", ")}.
                        </small>
                      ) : null}
                      <button
                        className="ghost-control"
                        disabled={emailState.kind === "notice"}
                        onClick={() => void sendEmailLink(accountEmail)}
                        type="button"
                      >
                        Send me a fresh sign-in link
                      </button>
                      <small>Useful to sign in on another device.</small>
                      {emailState.message ? (
                        <p className={`form-message ${emailState.kind}`}>{emailState.message}</p>
                      ) : null}
                    </div>
                  ) : null}

                  {isSignedIn ? (
                    <Link className="ghost-control saved-space-link" href="/saved">
                      <Bookmark aria-hidden="true" size={15} strokeWidth={2.4} />
                      View saved
                    </Link>
                  ) : null}
                  {isSignedIn ? (
                    <Link className="ghost-control saved-space-link" href="/curators/apply">
                      <Star aria-hidden="true" size={15} strokeWidth={2.4} />
                      Become a curator
                    </Link>
                  ) : null}
                  {isSignedIn ? (
                    <button
                      className="ghost-control"
                      onClick={() => void signOut({ callbackUrl: "/" })}
                      type="button"
                    >
                      Sign out
                    </button>
                  ) : null}
                </div>
              </section>
              ) : null}

              {activeSection === "why" ? (
              <section className="listener-panel">
                <h3>Why these shows?</h3>
                {scorePreview ? (
                  <>
                    <p>
                      Current top match: <strong>{scorePreview.eventTitle}</strong>{" "}
                      at {scorePreview.matchPercent}%.
                    </p>
                    <div className="listener-component-list">
                      {topComponents.map((component) => (
                        <div key={component.label}>
                          <span>
                            <strong>{component.label}</strong>
                            <small>
                              base {component.base}, weight {component.weight}%, adjustment{" "}
                              {component.adjustment > 0 ? "+" : ""}
                              {component.adjustment}
                            </small>
                          </span>
                          <em>{component.total}</em>
                        </div>
                      ))}
                    </div>
                    {scorePreview.reasons.length > 0 ? (
                      <div className="listener-reason-row">
                        {scorePreview.reasons.map((reason) => (
                          <span key={reason}>{reason}</span>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p>
                    AVLmc combines timing, community heat, local context, Spotify taste, learned
                    behavior, and the tuning below.
                  </p>
                )}
              </section>
              ) : null}

              {activeSection === "tune" ? (
              <section className="listener-panel listener-tuning-panel">
                <div className="listener-panel-heading">
                  <SlidersHorizontal aria-hidden="true" size={18} strokeWidth={2.4} />
                  <div>
                    <h3>Tune what surfaces first</h3>
                    <p>
                      Start with a preset, then fine-tune if you want. 100% keeps the default weight;
                      lower removes it, higher boosts it.
                    </p>
                  </div>
                </div>
                <div className="listener-preset-grid">
                  {LISTENER_PRESETS.map((preset) => (
                    <button
                      aria-pressed={activePresetId === preset.id}
                      className={`listener-preset${activePresetId === preset.id ? " on" : ""}`}
                      key={preset.id}
                      onClick={() => applyPreset(preset)}
                      type="button"
                    >
                      <strong>{preset.name}</strong>
                      <small>{preset.description}</small>
                    </button>
                  ))}
                </div>
                <button
                  aria-expanded={showAdvanced}
                  className="listener-adv-toggle"
                  onClick={() => setShowAdvanced((current) => !current)}
                  type="button"
                >
                  {showAdvanced ? "⚙ Advanced — hide dials" : "⚙ Advanced — show all 10 dials"}
                </button>
                {showAdvanced ? (
              <div className="listener-slider-grid">
                {LISTENER_PREFERENCE_CONTROLS.map((control) => (
                  <label className="listener-slider" key={control.key}>
                    <span>
                      <strong>{control.label}</strong>
                      <small>{control.description}</small>
                    </span>
                    <output>{draftPreferences.weights[control.key]}%</output>
                    <input
                      max={200}
                      min={0}
                      onChange={(event) => updateWeight(control.key, Number(event.target.value))}
                      step={10}
                      type="range"
                      value={draftPreferences.weights[control.key]}
                    />
                  </label>
                ))}
              </div>
                ) : null}
              </section>
              ) : null}

              {activeSection === "boosts" ? (
              <section className="listener-panel listener-custom-panel">
                <h3>Custom boosts and lowers</h3>
                <p>Directly shape your list — pin the venues and artists you love, mute what you don&apos;t.</p>
              <div className="listener-custom-form">
                <select
                  aria-label="Custom signal direction"
                  onChange={(event) =>
                    setNewSignalDirection(event.target.value as ListenerCustomSignalDirection)
                  }
                  value={newSignalDirection}
                >
                  <option value="boost">Boost</option>
                  <option value="lower">Lower</option>
                </select>
                <select
                  aria-label="Custom signal type"
                  onChange={(event) => setNewSignalKind(event.target.value as ListenerCustomSignalKind)}
                  value={newSignalKind}
                >
                  <option value="artist">Artist</option>
                  <option value="venue">Venue</option>
                  <option value="tag">Tag</option>
                  <option value="keyword">Keyword</option>
                </select>
                <input
                  aria-label="Custom signal"
                  onChange={(event) => setNewSignalLabel(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addCustomSignal();
                    }
                  }}
                  placeholder="Example: The Orange Peel"
                  type="text"
                  value={newSignalLabel}
                />
                <button onClick={addCustomSignal} type="button">
                  <Plus aria-hidden="true" size={16} strokeWidth={2.5} />
                  Add
                </button>
              </div>
              {draftPreferences.customSignals.length > 0 ? (
                <div className="listener-custom-list">
                  {draftPreferences.customSignals.map((signal) => (
                    <div className="listener-custom-item" key={signal.id}>
                      <span>
                        <strong>
                          {signal.direction === "boost" ? "Boost" : "Lower"} {signal.label}
                        </strong>
                        <small>{CUSTOM_SIGNAL_KIND_LABELS[signal.kind]}</small>
                      </span>
                      <input
                        aria-label={`Weight for ${signal.label}`}
                        max={80}
                        min={1}
                        onChange={(event) => updateCustomSignalWeight(signal.id, Number(event.target.value))}
                        type="range"
                        value={signal.weight}
                      />
                      <output>{signal.weight}</output>
                      <button
                        aria-label={`Remove ${signal.label}`}
                        className="listener-icon-button"
                        onClick={() => removeCustomSignal(signal.id)}
                        type="button"
                      >
                        <Trash2 aria-hidden="true" size={16} strokeWidth={2.4} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-copy">Add artists, venues, tags, or keywords to directly shape your list.</p>
              )}
              </section>
              ) : null}

              {activeSection === "sharing" ? (
              <>
              <section className="listener-panel listener-sharing-panel">
              <div className="listener-panel-heading">
                <Users aria-hidden="true" size={18} strokeWidth={2.4} />
                <div>
                  <h3>Friends &amp; sharing</h3>
                  <p>Following is one-way and private. Your activity stays hidden until you opt in below.</p>
                </div>
              </div>
              <label className="listener-toggle">
                <input
                  checked={draftPreferences.shareActivity}
                  onChange={(event) => setShareActivity(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  <strong>Let people you approve see what you&apos;re going to and firing</strong>
                  <small>
                    Off by default. Only listeners you&apos;ve approved can see your going/firing — never
                    anonymous visitors. This never changes the public community counts everyone already sees.
                  </small>
                </span>
              </label>
            </section>

            <section className="listener-panel listener-sharing-panel">
              <div className="listener-panel-heading">
                <Users aria-hidden="true" size={18} strokeWidth={2.4} />
                <div>
                  <h3>Community Name Visibility</h3>
                  <p>How your name appears on songs and notes you add to the community board.</p>
                </div>
              </div>
              <div className="listener-visibility-options" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <label className="listener-radio">
                  <input
                    checked={draftPreferences.contributionVisibility === "anonymous"}
                    onChange={() => setContributionVisibility("anonymous")}
                    type="radio"
                    name="contributionVisibility"
                  />
                  <span>
                    <strong>Anonymous</strong>
                    <small>Your name is never shown. Safest for privacy.</small>
                  </span>
                </label>
                <label className="listener-radio">
                  <input
                    checked={draftPreferences.contributionVisibility === "followers"}
                    onChange={() => setContributionVisibility("followers")}
                    type="radio"
                    name="contributionVisibility"
                  />
                  <span>
                    <strong>Followers Only</strong>
                    <small>Only people who follow you can see your name.</small>
                  </span>
                </label>
                <label className="listener-radio">
                  <input
                    checked={draftPreferences.contributionVisibility === "everyone"}
                    onChange={() => setContributionVisibility("everyone")}
                    type="radio"
                    name="contributionVisibility"
                  />
                  <span>
                    <strong>Everyone</strong>
                    <small>Your name is public. (Curators get a clickable profile link).</small>
                  </span>
                </label>
              </div>
            </section>
              </>
              ) : null}

              </div>
            </div>

            <div className="listener-modal-foot">
              <p className="listener-foot-status">
                {isSignedIn ? (
                  <>
                    Signed in · changes save to <strong>your account</strong>
                  </>
                ) : (
                  <>
                    Editing as <strong>guest</strong> · changes live in this browser
                  </>
                )}
              </p>
              <button className="ghost-control" onClick={resetDraft} type="button">
                <RotateCcw aria-hidden="true" size={16} strokeWidth={2.4} />
                Reset dials
              </button>
              <button
                className="primary-action"
                disabled={isSaving || !hasPreferenceChanges(savedPreferences, draftPreferences)}
                onClick={() => void savePreferences()}
                type="button"
              >
                Save settings
              </button>
              {saveState.message ? (
                <p className={`form-message ${saveState.kind}`}>{saveState.message}</p>
              ) : null}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function ProfileAvatar({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  // Provider avatars can be signed, expiring URLs (e.g. Spotify serves Facebook `lookaside` CDN
  // links whose `ext` param is an expiry) — once they 403, fall back to the initials avatar instead
  // of showing a broken-image icon. Reset on URL change so a refreshed image gets another chance.
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [imageUrl]);

  if (imageUrl && !failed) {
    return (
      <span className="listener-avatar has-image">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" onError={() => setFailed(true)} src={imageUrl} />
      </span>
    );
  }

  // Clean initials chip: a single filled circle with the listener's initials, tinted by a color
  // derived from their name so each account looks distinct. No overlapping glyph — that read as
  // "broken." aria-hidden because the adjacent label already names the listener.
  return (
    <span
      aria-hidden="true"
      className="listener-avatar has-initials"
      style={{ backgroundColor: avatarColor(name) }}
    >
      <i>{getInitials(name)}</i>
    </span>
  );
}

/**
 * Deterministic, pleasant background color for an initials avatar. Hashes the name to a stable hue
 * and returns a mid-lightness, saturated tone that keeps white initials readable (WCAG-safe).
 */
function avatarColor(name: string) {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = name.charCodeAt(index) + ((hash << 5) - hash);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 52%, 42%)`;
}

function getSourceStatus({
  connected,
  connection,
  paused,
}: {
  connected: boolean;
  connection: MusicConnection | undefined;
  paused: boolean;
}) {
  if (!connected) {
    return "Connect Spotify to sync top artists and tracks, or tune this browser locally.";
  }
  if (paused) {
    return "Spotify is connected, but Spotify taste is paused for Best Match.";
  }

  return `Spotify connected${
    connection?.lastSyncedAt ? `, last synced ${formatDateTime(connection.lastSyncedAt)}` : ""
  }.`;
}

function getTopComponents(components: DiscoveryScoreComponents | undefined) {
  if (!components) {
    return [];
  }

  return Object.values(components)
    .filter((component) => Math.abs(component.total) > 0 || Math.abs(component.adjustment) > 0)
    .sort((left, right) => Math.abs(right.total) - Math.abs(left.total))
    .slice(0, 6);
}

function dispatchPreferenceChange(preferences: ListenerDiscoveryPreferences) {
  window.dispatchEvent(
    new CustomEvent(LISTENER_PREFERENCE_CHANGE_EVENT, {
      detail: { preferences },
    })
  );
}

function hasPreferenceChanges(
  savedPreferences: ListenerDiscoveryPreferences,
  draftPreferences: ListenerDiscoveryPreferences
) {
  return JSON.stringify(savedPreferences) !== JSON.stringify(draftPreferences);
}

function createSignalId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `signal-${Date.now()}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function getInitials(value: string) {
  const words = value
    .replace(/[^a-z0-9\s]/gi, " ")
    .split(/\s+/)
    .filter(Boolean);

  return (words[0]?.[0] ?? "A") + (words[1]?.[0] ?? words[0]?.[1] ?? "V");
}
