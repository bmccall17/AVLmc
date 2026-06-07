import type { Metadata } from "next";
import { CalendarCheck, EyeOff, Flame } from "lucide-react";

export const metadata: Metadata = {
  title: "Discovery Action Sandbox",
  robots: {
    follow: false,
    index: false,
  },
};

const sampleEvents = [
  {
    artist: "River Radio",
    date: "Sat Jun 13",
    fire: 12,
    going: 8,
    reasons: ["matches your recent picks", "happening soon"],
    songs: 4,
    tags: ["Indie", "Dance", "Local"],
    time: "8:00 PM",
    title: "River Radio with Glass Moon",
    venue: "The Orange Peel",
  },
  {
    artist: "Blue Ridge Brass",
    date: "Sun Jun 14",
    fire: 5,
    going: 3,
    reasons: ["learned from your clicks", "local context"],
    songs: 2,
    tags: ["Jazz", "Outdoor", "Free"],
    time: "6:30 PM",
    title: "Blue Ridge Brass Patio Session",
    venue: "Salvage Station",
  },
];

export default function DiscoveryActionSandboxPage() {
  return (
    <main className="sandbox-shell">
      <header className="sandbox-header">
        <p className="eyebrow">Hidden sandbox</p>
        <h1>Discovery action treatments</h1>
        <p className="lede">
          Two homepage card controls for planning, fire, and remove.
        </p>
      </header>

      <section className="sandbox-layout" aria-label="Discovery action design variants">
        <div className="sandbox-variant">
          <h2>Primary inline actions</h2>
          <div className="sandbox-card-stack">
            {sampleEvents.map((event, index) => (
              <SandboxCard key={event.title} event={event} mode="primary" selected={index === 0} />
            ))}
          </div>
        </div>

        <div className="sandbox-variant">
          <h2>Compact icon row</h2>
          <div className="sandbox-card-stack">
            {sampleEvents.map((event, index) => (
              <SandboxCard key={event.title} event={event} mode="compact" selected={index === 0} />
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

function SandboxCard({
  event,
  mode,
  selected,
}: {
  event: (typeof sampleEvents)[number];
  mode: "compact" | "primary";
  selected: boolean;
}) {
  return (
    <article className="sandbox-event-card">
      <div className="sandbox-date">
        <span>{event.date.split(" ")[0]}</span>
        <strong>{event.date.replace(/^[A-Za-z]+ /, "")}</strong>
      </div>
      <div className="sandbox-art" aria-hidden="true">
        <span>{event.artist.slice(0, 2)}</span>
      </div>
      <div className="sandbox-card-body">
        <p className="card-kicker">{event.venue}</p>
        <h3>{event.title}</h3>
        <p className="event-meta">
          {event.time} · {event.artist}
        </p>
        <div className="reason-row" aria-label="Recommendation reasons">
          {event.reasons.map((reason) => (
            <span key={reason}>{reason}</span>
          ))}
        </div>
        <div className="tag-row">
          {event.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        {mode === "primary" ? (
          <div className="card-learning-actions" aria-label="Primary discovery actions">
            <button
              aria-pressed={selected}
              className={`learning-action planning ${selected ? "is-active" : ""}`}
              type="button"
            >
              <span>I&apos;m planning to go</span>
              <strong>{event.going}</strong>
            </button>
            <button
              aria-pressed={selected}
              className={`learning-action fire ${selected ? "is-active" : ""}`}
              type="button"
            >
              <span>Fire</span>
              <strong>{event.fire}</strong>
            </button>
            <button className="learning-action remove" type="button">
              Remove
            </button>
          </div>
        ) : (
          <div className="compact-learning-actions" aria-label="Compact discovery actions">
            <button
              aria-label={`Planning to go: ${event.going}`}
              aria-pressed={selected}
              title="Planning to go"
              type="button"
            >
              <CalendarCheck aria-hidden="true" size={18} strokeWidth={2.4} />
              <strong>{event.going}</strong>
            </button>
            <button
              aria-label={`Fire: ${event.fire}`}
              aria-pressed={selected}
              title="Fire"
              type="button"
            >
              <Flame aria-hidden="true" size={18} strokeWidth={2.4} />
              <strong>{event.fire}</strong>
            </button>
            <button aria-label="Remove from my listings" title="Remove from my listings" type="button">
              <EyeOff aria-hidden="true" size={18} strokeWidth={2.4} />
            </button>
          </div>
        )}
        <div className="signal-row" aria-label="Community signals">
          <span>{event.going} planning</span>
          <span>2 notes</span>
          <span>{event.songs} songs</span>
          <span>{event.fire} fire</span>
        </div>
      </div>
    </article>
  );
}
