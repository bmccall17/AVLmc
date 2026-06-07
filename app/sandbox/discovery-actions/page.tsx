import type { Metadata } from "next";
import { CalendarCheck, Flame, X } from "lucide-react";

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
    image:
      "linear-gradient(145deg, rgba(12, 12, 12, 0.12), rgba(10, 10, 10, 0.88)), radial-gradient(circle at 24% 18%, rgba(255, 237, 213, 0.92), transparent 19rem), linear-gradient(135deg, #18181b 0%, #52525b 44%, #09090b 100%)",
    match: 94,
    note: "Maya and Jules both saved this one after your last Orange Peel pick.",
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
    image:
      "linear-gradient(145deg, rgba(9, 9, 11, 0.1), rgba(9, 9, 11, 0.9)), radial-gradient(circle at 72% 22%, rgba(251, 146, 60, 0.72), transparent 15rem), linear-gradient(135deg, #27272a 0%, #3f3f46 48%, #09090b 100%)",
    match: 87,
    note: "Low-pressure patio set with the same local brass thread you keep opening.",
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
        <h1>Music event card redesign</h1>
        <p className="lede">
          Image-forward discovery cards with match signals and hover actions.
        </p>
      </header>

      <section className="sandbox-layout" aria-label="Music event card redesign">
        {sampleEvents.map((event, index) => (
          <SandboxCard key={event.title} event={event} selected={index === 0} />
        ))}
      </section>
    </main>
  );
}

function SandboxCard({
  event,
  selected,
}: {
  event: (typeof sampleEvents)[number];
  selected: boolean;
}) {
  return (
    <article className="sandbox-event-card" tabIndex={0}>
      <div className="sandbox-art" style={{ background: event.image }} aria-hidden="true">
        <span>{event.artist.slice(0, 2)}</span>
      </div>

      <div className="sandbox-card-top">
        <span>{event.tags[0]}</span>
        <strong>{event.match}% match</strong>
      </div>

      <div className="sandbox-card-body">
        <div className="sandbox-date">
          <span>{event.date.split(" ")[0]}</span>
          <strong>{event.date.replace(/^[A-Za-z]+ /, "")}</strong>
        </div>
        <p className="card-kicker">{event.venue}</p>
        <h3>{event.title}</h3>
        <p className="event-meta">
          {event.time} · {event.artist}
        </p>
        <div className="sandbox-pulse" aria-label="Social pulse">
          <span className="avatar-stack" aria-hidden="true">
            <i>M</i>
            <i>J</i>
            <i>R</i>
          </span>
          <span>
            {event.going} planning · {event.songs} songs · {event.fire} fire
          </span>
        </div>
        <p className="sandbox-note">{event.note}</p>
      </div>

      <div className="sandbox-action-bar" aria-label="Discovery actions">
        <button aria-pressed={selected} className="is-going" type="button">
          <CalendarCheck aria-hidden="true" size={16} strokeWidth={2.5} />
          <span>Going</span>
          <strong>{event.going}</strong>
        </button>
        <button aria-pressed={selected} className="is-fire" type="button">
          <Flame aria-hidden="true" size={16} strokeWidth={2.5} />
          <span>Fire</span>
          <strong>{event.fire}</strong>
        </button>
        <button aria-label="Remove from my listings" className="is-remove" type="button">
          <X aria-hidden="true" size={18} strokeWidth={2.6} />
        </button>
      </div>
    </article>
  );
}
