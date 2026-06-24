"use client";

import { useState } from "react";
import Link from "next/link";
import { EmailSignInPanel } from "@/components/EmailSignInPanel";
import type { AuthFeatureFlags } from "@/lib/auth-flags";
import {
  RECOMMENDATION_NAME_MAX,
  RECOMMENDATION_LINK_MAX,
  RECOMMENDATION_REASON_MAX,
} from "@/lib/curator-recommendations-core";

type FormState = { kind: "idle" | "saving" | "error" | "success"; message: string };

/**
 * "Recommend a curator" form (parked backlog item) — replaces the old `mailto:` with a short in-app
 * intake. A signed-in listener nominates someone who should curate; it posts to the C1
 * `POST /api/me/curator-recommendation`, which queues it for admin review (and emails the admin).
 * Anonymous visitors get the same email-first sign-in nudge as the apply flow. Private to the
 * submitter + admin — nothing here is public, no pay-to-play.
 */
export function CuratorRecommendForm({
  isSignedIn,
  features,
}: {
  isSignedIn: boolean;
  features: AuthFeatureFlags;
}) {
  const [nomineeName, setNomineeName] = useState("");
  const [nomineeLink, setNomineeLink] = useState("");
  const [reason, setReason] = useState("");
  const [form, setForm] = useState<FormState>({ kind: "idle", message: "" });

  async function submit() {
    setForm({ kind: "saving", message: "Submitting…" });
    try {
      const response = await fetch("/api/me/curator-recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nomineeName: nomineeName.trim(),
          nomineeLink: nomineeLink.trim(),
          reason: reason.trim(),
        }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Could not send your recommendation.");
      }
      setForm({ kind: "success", message: "Thanks — your recommendation is in. An admin will take a look." });
    } catch (error) {
      setForm({
        kind: "error",
        message: error instanceof Error ? error.message : "Could not send your recommendation.",
      });
    }
  }

  if (!isSignedIn) {
    return (
      <div className="curator-apply-panel">
        <EmailSignInPanel
          callbackUrl="/curators/recommend"
          description="Sign in to recommend a curator. Your recommendation is private — only you and an admin can see it. No password, no Spotify required."
          features={features}
        />
      </div>
    );
  }

  if (form.kind === "success") {
    return (
      <div className="curator-apply-panel">
        <p className="form-message success">{form.message}</p>
        <div className="curator-apply-actions">
          <Link className="ghost-control" href="/curators">
            Back to curators
          </Link>
        </div>
      </div>
    );
  }

  const canSubmit = Boolean(nomineeName.trim()) && form.kind !== "saving";

  return (
    <form
      className="curator-apply-panel curator-apply-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSubmit) void submit();
      }}
    >
      <label className="curator-apply-field">
        <span>Who should curate?</span>
        <input
          autoComplete="off"
          maxLength={RECOMMENDATION_NAME_MAX}
          name="nomineeName"
          onChange={(event) => setNomineeName(event.target.value)}
          placeholder="Name, DJ, venue booker, music writer…"
          value={nomineeName}
        />
        <small>The person or crew you think should curate Asheville shows.</small>
      </label>

      <label className="curator-apply-field">
        <span>Link (optional)</span>
        <input
          inputMode="url"
          maxLength={RECOMMENDATION_LINK_MAX}
          name="nomineeLink"
          onChange={(event) => setNomineeLink(event.target.value)}
          placeholder="Instagram, website, Bandcamp…"
          value={nomineeLink}
        />
        <small>Anything that helps an admin find them.</small>
      </label>

      <label className="curator-apply-field">
        <span>Why them? (optional)</span>
        <textarea
          maxLength={RECOMMENDATION_REASON_MAX}
          name="reason"
          onChange={(event) => setReason(event.target.value)}
          placeholder="What makes their taste worth following."
          rows={3}
          value={reason}
        />
        <small>Private to you and an admin. {reason.length}/{RECOMMENDATION_REASON_MAX}</small>
      </label>

      <div className="curator-apply-actions">
        <button className="primary-action" disabled={!canSubmit} type="submit">
          Send recommendation
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
