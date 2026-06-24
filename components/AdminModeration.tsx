"use client";

import { useMemo, useState } from "react";
import type { ContributionStatus, PublicContribution } from "@/lib/community";

type StatusFilter = ContributionStatus | "all";

type AdminModerationProps = {
  contributions: PublicContribution[];
  currentStatus: StatusFilter;
};

// "pending" is repurposed as an explicit admin-set "Needs review" holding state (still hidden from
// the public board, which only ever renders `visible`). New contributions are never auto-pending.
const STATUS_LABEL: Record<ContributionStatus, string> = {
  visible: "Visible",
  hidden: "Hidden",
  pending: "Needs review",
};

const FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "visible", label: "Visible" },
  { id: "hidden", label: "Hidden" },
  { id: "pending", label: "Needs review" },
];

export function AdminModeration({ contributions, currentStatus }: AdminModerationProps) {
  const [items, setItems] = useState(contributions);
  const [filter, setFilter] = useState<StatusFilter>(currentStatus);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: items.length,
      visible: 0,
      hidden: 0,
      pending: 0,
    };
    for (const item of items) c[item.status] += 1;
    return c;
  }, [items]);

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((item) => item.status === filter)),
    [items, filter]
  );

  async function setStatus(id: string, status: ContributionStatus) {
    setSavingId(id);
    setMessage("");

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

      // Update in place — the item stays in the full list and naturally moves between filter views.
      setItems((current) => current.map((item) => (item.id === id ? data.contribution! : item)));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update contribution.");
    } finally {
      setSavingId(null);
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
          {FILTERS.map((option) => (
            <button
              type="button"
              key={option.id}
              className="status-tab"
              aria-current={filter === option.id ? "page" : undefined}
              onClick={() => setFilter(option.id)}
            >
              {option.label}
              <span className="status-tab-count">{counts[option.id]}</span>
            </button>
          ))}
        </nav>
      </div>

      {message ? <p className="form-message error">{message}</p> : null}

      {filtered.length === 0 ? (
        <section className="empty-state">
          <h2>No contributions found</h2>
          <p>Nothing matches this moderation filter yet.</p>
        </section>
      ) : (
        <div className="admin-list">
          {filtered.map((item) => (
            <ModerationRow
              key={item.id}
              item={item}
              busy={savingId === item.id}
              onSetStatus={setStatus}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ModerationRow({
  item,
  busy,
  onSetStatus,
}: {
  item: PublicContribution;
  busy: boolean;
  onSetStatus: (id: string, status: ContributionStatus) => void;
}) {
  return (
    <article className={`admin-item status-${item.status}`}>
      <div className="admin-item-main">
        <div className="admin-item-head">
          <span className={`status-pill ${item.status}`}>{STATUS_LABEL[item.status]}</span>
          <span className="admin-item-type">{item.type}</span>
          <a className="admin-item-event" href={`/event/${item.eventId}`} target="_blank" rel="noreferrer">
            {item.eventTitle} ↗
          </a>
        </div>
        <p className="admin-item-by">
          {item.displayName || "Anonymous"}
          {item.curatorHandle ? (
            <span className="admin-curator-badge">curator @{item.curatorHandle}</span>
          ) : null}
          {" · "}
          <time dateTime={item.createdAt} title={formatAbsolute(item.createdAt)}>
            {formatRelative(item.createdAt)}
          </time>
        </p>
        <ContributionSummary contribution={item} />
      </div>
      <div className="admin-actions">
        <ModerationActions status={item.status} busy={busy} onSetStatus={(status) => onSetStatus(item.id, status)} />
      </div>
    </article>
  );
}

function ModerationActions({
  status,
  busy,
  onSetStatus,
}: {
  status: ContributionStatus;
  busy: boolean;
  onSetStatus: (status: ContributionStatus) => void;
}) {
  if (status === "visible") {
    return (
      <>
        <button className="admin-action-primary danger" disabled={busy} onClick={() => onSetStatus("hidden")} type="button">
          Hide
        </button>
        <button className="admin-action-secondary" disabled={busy} onClick={() => onSetStatus("pending")} type="button">
          Flag for review
        </button>
      </>
    );
  }

  if (status === "hidden") {
    return (
      <>
        <button className="admin-action-primary" disabled={busy} onClick={() => onSetStatus("visible")} type="button">
          Restore
        </button>
        <button className="admin-action-secondary" disabled={busy} onClick={() => onSetStatus("pending")} type="button">
          Flag for review
        </button>
      </>
    );
  }

  // pending → Needs review: the decide state.
  return (
    <>
      <button className="admin-action-primary" disabled={busy} onClick={() => onSetStatus("visible")} type="button">
        Restore
      </button>
      <button className="admin-action-secondary danger" disabled={busy} onClick={() => onSetStatus("hidden")} type="button">
        Hide
      </button>
    </>
  );
}

function ContributionSummary({ contribution }: { contribution: PublicContribution }) {
  const [expanded, setExpanded] = useState(false);

  if (contribution.type === "song") {
    return (
      <p className="admin-item-content">
        <strong>{contribution.songTitle}</strong>
        {contribution.songArtist ? ` — ${contribution.songArtist}` : ""}
        {contribution.songUrl ? (
          <>
            {" · "}
            <a href={contribution.songUrl} target="_blank" rel="noreferrer">
              link ↗
            </a>
          </>
        ) : null}
      </p>
    );
  }

  if (contribution.type === "voice") {
    return <p className="admin-item-content muted">Audio contribution deferred for this release.</p>;
  }

  const body = contribution.bodyText ?? "";
  const isLong = body.length > 180;

  return (
    <p className={`admin-item-content${isLong && !expanded ? " clamped" : ""}`}>
      {body}
      {isLong ? (
        <button type="button" className="admin-item-expand" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "less" : "more"}
        </button>
      ) : null}
    </p>
  );
}

function formatRelative(value: string): string {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatAbsolute(value);
}

function formatAbsolute(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
