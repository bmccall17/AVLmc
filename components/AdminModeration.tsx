"use client";

import { useState } from "react";
import type { ContributionStatus, PublicContribution } from "@/lib/community";

type AdminModerationProps = {
  contributions: PublicContribution[];
  currentStatus: ContributionStatus | "all";
};

export function AdminModeration({ contributions, currentStatus }: AdminModerationProps) {
  const [items, setItems] = useState(contributions);
  const [message, setMessage] = useState("");

  async function setStatus(id: string, status: ContributionStatus) {
    setMessage("Saving...");

    try {
      const response = await fetch("/api/admin/contributions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const data = (await response.json()) as {
        contribution?: PublicContribution;
        error?: string;
      };

      if (!response.ok || !data.contribution) {
        throw new Error(data.error ?? "Could not update contribution.");
      }

      setItems((current) =>
        currentStatus === "all" || currentStatus === data.contribution?.status
          ? current.map((item) => (item.id === id ? data.contribution! : item))
          : current.filter((item) => item.id !== id)
      );
      setMessage("Saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update contribution.");
    }
  }

  return (
    <section className="admin-panel">
      <div className="admin-toolbar">
        <div>
          <p className="eyebrow">Moderation</p>
          <h1>Recent contributions</h1>
        </div>
        <nav className="status-tabs" aria-label="Contribution status filter">
          {(["all", "visible", "hidden", "pending"] as const).map((status) => (
            <a
              aria-current={currentStatus === status ? "page" : undefined}
              href={status === "all" ? "/admin" : `/admin?status=${status}`}
              key={status}
            >
              {status}
            </a>
          ))}
        </nav>
      </div>

      {message ? <p className="form-message idle">{message}</p> : null}

      {items.length === 0 ? (
        <section className="empty-state">
          <h2>No contributions found</h2>
          <p>Nothing matches this moderation filter yet.</p>
        </section>
      ) : (
        <div className="admin-list">
          {items.map((item) => (
            <article className="admin-item" key={item.id}>
              <div>
                <span className={`status-pill ${item.status}`}>{item.status}</span>
                <h2>{item.eventTitle}</h2>
                <p className="admin-meta">
                  {item.type} by {item.displayName || "Anonymous"} · {formatDateTime(item.createdAt)}
                </p>
                <ContributionSummary contribution={item} />
              </div>
              <div className="admin-actions">
                {item.status !== "hidden" ? (
                  <button onClick={() => setStatus(item.id, "hidden")} type="button">
                    Hide
                  </button>
                ) : null}
                {item.status !== "visible" ? (
                  <button onClick={() => setStatus(item.id, "visible")} type="button">
                    Unhide
                  </button>
                ) : null}
                {item.status !== "pending" ? (
                  <button onClick={() => setStatus(item.id, "pending")} type="button">
                    Pending
                  </button>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ContributionSummary({ contribution }: { contribution: PublicContribution }) {
  if (contribution.type === "song") {
    return (
      <p>
        Song: {contribution.songTitle}
        {contribution.songArtist ? ` by ${contribution.songArtist}` : ""} ·{" "}
        {contribution.songUrl}
      </p>
    );
  }

  if (contribution.type === "voice") {
    return <p>Audio contribution deferred for this release.</p>;
  }

  return <p>{contribution.bodyText}</p>;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
