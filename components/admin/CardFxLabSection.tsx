"use client";

import {
  CalendarCheck,
  ExternalLink,
  Flame,
  Star,
  X,
  Bookmark,
} from "lucide-react";
import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

/**
 * Card FX Lab — an admin-only prototyping surface for tuning the look of discovery
 * event cards. It renders a self-contained MOCK of `DiscoveryEventCard`
 * (components/EventBoard.tsx) using the exact same `.sandbox-*` class structure, so
 * the preview matches production visuals, and layers tunable effects on top via the
 * `.is-fired` class + CSS custom properties (see app/globals.css `.card-lab-*` block).
 *
 * Nothing here touches the live feed — once an effect is dialed in, copy the values
 * from the export readout into the real `.sandbox-event-card` / `.is-fire` CSS.
 */

// --- mock card content -------------------------------------------------------

const MOCK = {
  imageUrl:
    "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?auto=format&fit=crop&w=900&q=80",
  tag: "Indie Folk",
  match: 92,
  weekday: "FRI",
  monthDay: "Jul 18",
  venueName: "The Grey Eagle",
  eventTitle: "Hiss Golden Messenger",
  eventTime: "8:00 PM",
  artistName: "Hiss Golden Messenger",
  going: 24,
  songs: 7,
  fire: 13,
  note: "Three people in your circle saved songs from this artist, and it lines up with your late-week folk listening.",
  reasons: ["Matches your taste", "Friends going", "New this week"],
  spotifySaves: 9,
  ticketClicks: 5,
  circle: 3,
  curatedBy: "Ashe Sounds",
};

// --- element toggles ---------------------------------------------------------

type ElementKey =
  | "image"
  | "tag"
  | "top30"
  | "match"
  | "date"
  | "venue"
  | "title"
  | "meta"
  | "pulse"
  | "note"
  | "reasons"
  | "intent"
  | "links"
  | "shared"
  | "circle"
  | "curated"
  | "actions"
  | "save";

const ELEMENTS: Array<{ key: ElementKey; label: string }> = [
  { key: "image", label: "OG image" },
  { key: "tag", label: "Genre tag" },
  { key: "top30", label: "Top 30 badge" },
  { key: "match", label: "Match pill" },
  { key: "date", label: "Date block" },
  { key: "venue", label: "Venue (kicker)" },
  { key: "title", label: "Title" },
  { key: "meta", label: "Time + artist (meta)" },
  { key: "pulse", label: "Social pulse" },
  { key: "note", label: "Recommendation note" },
  { key: "reasons", label: "Reason badges" },
  { key: "intent", label: "Intent sources" },
  { key: "links", label: "Details / AVLgo links" },
  { key: "shared", label: "Shared songs" },
  { key: "circle", label: "From-your-circle badge" },
  { key: "curated", label: "Curated-by badge" },
  { key: "actions", label: "Action bar" },
  { key: "save", label: "Save button" },
];

const ALL_VISIBLE: Record<ElementKey, boolean> = ELEMENTS.reduce(
  (acc, el) => ({ ...acc, [el.key]: true }),
  {} as Record<ElementKey, boolean>,
);

// --- fire FX settings --------------------------------------------------------

type FxSettings = {
  glowOn: boolean;
  intensity: number; // 0..1
  color: string; // hex
  pulseSpeed: number; // seconds per pulse
  turbulenceOn: boolean;
  turbulence: number; // displacement scale (px)
  flicker: number; // seconds per turbulence cycle
  hotspotOn: boolean;
  hotspotStrength: number; // 0..1
  embersOn: boolean;
  emberDensity: number; // count of particles
};

const DEFAULT_FX: FxSettings = {
  glowOn: true,
  intensity: 0.65,
  color: "#ff6a00",
  pulseSpeed: 2.6,
  turbulenceOn: true,
  turbulence: 14,
  flicker: 3.2,
  hotspotOn: true,
  hotspotStrength: 0.8,
  embersOn: true,
  emberDensity: 12,
};

const EMBER_PALETTE = ["#ff3d00", "#ff6a00", "#ff9500", "#ffcf33", "#ff2d55"];

export function CardFxLabSection() {
  const [visible, setVisible] = useState<Record<ElementKey, boolean>>(ALL_VISIBLE);
  const [fx, setFx] = useState<FxSettings>(DEFAULT_FX);

  // live pressed state for the action buttons
  const [going, setGoing] = useState(false);
  const [fired, setFired] = useState(true);
  const [saved, setSaved] = useState(false);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  const showFire = fired && fx.glowOn;

  function setFxValue<K extends keyof FxSettings>(key: K, value: FxSettings[K]) {
    setFx((prev) => ({ ...prev, [key]: value }));
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const el = cardRef.current;
    if (!el || !fx.hotspotOn) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    // edge proximity: 1 at any border, 0 in the dead center
    const edge = 1 - (Math.min(x, 100 - x, y, 100 - y) / 50);
    el.style.setProperty("--mx", `${x}%`);
    el.style.setProperty("--my", `${y}%`);
    el.style.setProperty("--edge", edge.toFixed(3));
  }

  const cardStyle = useMemo<CSSProperties>(
    () =>
      ({
        "--fire-color": fx.color,
        "--fire-intensity": fx.intensity,
        "--fire-speed": `${fx.pulseSpeed}s`,
        "--fire-hotspot": fx.hotspotOn ? fx.hotspotStrength : 0,
        "--churn": dragging ? 1 : 0,
      }) as CSSProperties,
    [fx.color, fx.intensity, fx.pulseSpeed, fx.hotspotOn, fx.hotspotStrength, dragging],
  );

  const embers = useMemo(
    () =>
      Array.from({ length: fx.emberDensity }, (_, i) => {
        const left = Math.round((i * 53 + 11) % 100);
        const delay = ((i * 0.37) % fx.pulseSpeed).toFixed(2);
        const dur = (3 + ((i * 0.7) % 3)).toFixed(2);
        const size = 3 + (i % 4);
        const color = EMBER_PALETTE[i % EMBER_PALETTE.length];
        return { left, delay, dur, size, color, key: i };
      }),
    [fx.emberDensity, fx.pulseSpeed],
  );

  return (
    <section className="admin-section card-lab">
      <header className="card-lab-head">
        <h2>Card FX Lab</h2>
        <p className="admin-meta">
          Prototype the look of discovery event cards. Toggle elements, press the action
          buttons to watch their states, and dial in the “on fire” effect. Drag the cursor
          across the glowing edge to feel the turbulence. Production cards are untouched.
        </p>
      </header>

      <div className="card-lab-grid">
        {/* ---------------- preview ---------------- */}
        <div className="card-lab-stage">
          <div
            ref={cardRef}
            className={`sandbox-event-card fresh-card is-revealed card-lab-card${
              showFire ? " is-fired" : ""
            }${fx.turbulenceOn ? " fx-turbulence" : ""}${
              fx.hotspotOn ? " fx-hotspot" : ""
            }`}
            style={cardStyle}
            onPointerMove={handlePointerMove}
            onPointerDown={() => setDragging(true)}
            onPointerUp={() => setDragging(false)}
            onPointerLeave={() => setDragging(false)}
          >
            {/* fire effect layers (pointer-events: none) */}
            {showFire ? (
              <div className="card-lab-fx" aria-hidden="true">
                <span className="card-lab-fx-glow" />
                {fx.turbulenceOn ? <span className="card-lab-fx-turb" /> : null}
                {fx.hotspotOn ? <span className="card-lab-fx-hotspot" /> : null}
                {fx.embersOn ? (
                  <span className="card-lab-fx-embers">
                    {embers.map((em) => (
                      <i
                        key={em.key}
                        style={
                          {
                            left: `${em.left}%`,
                            width: em.size,
                            height: em.size,
                            background: em.color,
                            animationDelay: `${em.delay}s`,
                            animationDuration: `${em.dur}s`,
                          } as CSSProperties
                        }
                      />
                    ))}
                  </span>
                ) : null}
              </div>
            ) : null}

            {/* poster */}
            <div
              className={`sandbox-art ${visible.image ? "has-image" : "is-fallback"}`}
              aria-hidden="true"
            >
              {visible.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" decoding="async" loading="lazy" src={MOCK.imageUrl} />
              ) : null}
              <span>HG</span>
            </div>

            {/* top row */}
            <div className="sandbox-card-top">
              <div className="sandbox-card-tags">
                {visible.tag ? <span className="sandbox-card-tag">{MOCK.tag}</span> : null}
                {visible.top30 ? (
                  <span className="sandbox-top30-badge">
                    <Star aria-hidden="true" size={12} strokeWidth={2.6} />
                    Top 30
                  </span>
                ) : null}
              </div>
              {visible.match ? (
                <strong className="sandbox-match-pill">{MOCK.match}% match</strong>
              ) : null}
            </div>

            {/* body */}
            <div className="sandbox-card-body">
              {visible.date ? (
                <div className="sandbox-date">
                  <span>{MOCK.weekday}</span>
                  <strong>{MOCK.monthDay}</strong>
                </div>
              ) : null}
              {visible.venue ? <p className="card-kicker">{MOCK.venueName}</p> : null}
              {visible.title ? <h3>{MOCK.eventTitle}</h3> : null}
              {visible.meta ? (
                <p className="event-meta">
                  {MOCK.eventTime} · {MOCK.artistName}
                </p>
              ) : null}
              {visible.pulse ? (
                <div className="sandbox-pulse" aria-label="Social pulse">
                  <span className="avatar-stack" aria-hidden="true">
                    <i>M</i>
                    <i>J</i>
                    <i>R</i>
                  </span>
                  <span>
                    {MOCK.going} planning · {MOCK.songs} songs · {MOCK.fire} fire
                  </span>
                </div>
              ) : null}

              <div className="sandbox-card-disclosure">
                {visible.note ? <p className="sandbox-note">{MOCK.note}</p> : null}
                {visible.reasons ? (
                  <div
                    className="reason-row card-reason-row"
                    aria-label="Recommendation reasons"
                  >
                    {MOCK.reasons.map((reason) => (
                      <span className="reason-badge" key={reason}>
                        {reason}
                      </span>
                    ))}
                  </div>
                ) : null}
                {visible.intent ? (
                  <div
                    className="intent-mini-row card-intent-row"
                    aria-label="Saved signal sources"
                  >
                    <span className="spotify-source">Spotify {MOCK.spotifySaves}</span>
                    <span>AVLgo {MOCK.ticketClicks}</span>
                  </div>
                ) : null}
                {visible.links ? (
                  <div className="sandbox-card-links" aria-label="Event links">
                    <a href="#" onClick={(e) => e.preventDefault()}>
                      Details
                    </a>
                    <a href="#" onClick={(e) => e.preventDefault()}>
                      AVLgo <ExternalLink aria-hidden="true" size={13} strokeWidth={2.4} />
                    </a>
                  </div>
                ) : null}
                {visible.shared ? (
                  <div className="card-lab-shared">🎵 4 shared songs with you</div>
                ) : null}
                {visible.circle ? (
                  <span className="circle-badge" title={`${MOCK.circle} from your circle`}>
                    👥 {MOCK.circle} from your circle
                  </span>
                ) : null}
                {visible.curated ? (
                  <a
                    className="curated-by-badge"
                    href="#"
                    onClick={(e) => e.preventDefault()}
                  >
                    ★ curated by {MOCK.curatedBy}
                  </a>
                ) : null}
              </div>
            </div>

            {/* action bar */}
            {visible.actions ? (
              <div className="sandbox-action-bar" aria-label="Discovery actions">
                <button
                  type="button"
                  className="is-going"
                  aria-pressed={going}
                  onClick={() => setGoing((v) => !v)}
                >
                  <CalendarCheck aria-hidden="true" size={16} strokeWidth={2.5} />
                  <span>Going</span>
                  <strong>{MOCK.going + (going ? 1 : 0)}</strong>
                </button>
                <button
                  type="button"
                  className="is-fire"
                  aria-pressed={fired}
                  onClick={() => setFired((v) => !v)}
                >
                  <Flame aria-hidden="true" size={16} strokeWidth={2.5} />
                  <span>Fire</span>
                  <strong>{MOCK.fire + (fired ? 1 : 0)}</strong>
                </button>
                <button type="button" className="is-remove" aria-label="Remove">
                  <X aria-hidden="true" size={18} strokeWidth={2.6} />
                </button>
                {visible.save ? (
                  <button
                    type="button"
                    className="is-save"
                    aria-pressed={saved}
                    aria-label="Save"
                    onClick={() => setSaved((v) => !v)}
                  >
                    <Bookmark
                      aria-hidden="true"
                      size={16}
                      strokeWidth={2.5}
                      fill={saved ? "currentColor" : "none"}
                    />
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {/* inline SVG turbulence filter — driven numerically from fx state */}
          <svg
            className="card-lab-svg"
            width="0"
            height="0"
            aria-hidden="true"
            focusable="false"
          >
            <filter id="cardFireTurb" x="-30%" y="-30%" width="160%" height="160%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.012 0.024"
                numOctaves={2}
                seed={7}
                result="noise"
              >
                <animate
                  attributeName="baseFrequency"
                  dur={`${fx.flicker}s`}
                  values="0.012 0.024;0.018 0.034;0.012 0.024"
                  repeatCount="indefinite"
                />
              </feTurbulence>
              <feDisplacementMap
                in="SourceGraphic"
                in2="noise"
                scale={fx.turbulence}
                xChannelSelector="R"
                yChannelSelector="G"
              />
            </filter>
          </svg>
        </div>

        {/* ---------------- controls ---------------- */}
        <div className="card-lab-controls">
          <div className="card-lab-panel">
            <div className="card-lab-panel-head">
              <h3>Elements</h3>
              <div className="card-lab-panel-actions">
                <button
                  type="button"
                  onClick={() => setVisible(ALL_VISIBLE)}
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setVisible(
                      ELEMENTS.reduce(
                        (acc, el) => ({ ...acc, [el.key]: false }),
                        {} as Record<ElementKey, boolean>,
                      ),
                    )
                  }
                >
                  None
                </button>
              </div>
            </div>
            <div className="card-lab-toggles">
              {ELEMENTS.map((el) => (
                <label key={el.key} className="card-lab-toggle">
                  <input
                    type="checkbox"
                    checked={visible[el.key]}
                    onChange={(e) =>
                      setVisible((prev) => ({ ...prev, [el.key]: e.target.checked }))
                    }
                  />
                  <span>{el.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="card-lab-panel">
            <div className="card-lab-panel-head">
              <h3>On Fire 🔥</h3>
            </div>

            <label className="card-lab-toggle card-lab-toggle--lead">
              <input
                type="checkbox"
                checked={fired}
                onChange={(e) => setFired(e.target.checked)}
              />
              <span>Fired (whole-card effect)</span>
            </label>

            <FxRow label="Perimeter glow">
              <input
                type="checkbox"
                checked={fx.glowOn}
                onChange={(e) => setFxValue("glowOn", e.target.checked)}
              />
            </FxRow>
            <FxSlider
              label="Glow intensity"
              min={0}
              max={1}
              step={0.05}
              value={fx.intensity}
              onChange={(v) => setFxValue("intensity", v)}
              display={`${Math.round(fx.intensity * 100)}%`}
            />
            <FxRow label="Glow color">
              <div className="card-lab-color">
                {EMBER_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`card-lab-swatch${fx.color === c ? " is-active" : ""}`}
                    style={{ background: c }}
                    onClick={() => setFxValue("color", c)}
                    aria-label={`Ember ${c}`}
                  />
                ))}
                <input
                  type="color"
                  value={fx.color}
                  onChange={(e) => setFxValue("color", e.target.value)}
                />
              </div>
            </FxRow>
            <FxSlider
              label="Pulse speed"
              min={0.6}
              max={6}
              step={0.1}
              value={fx.pulseSpeed}
              onChange={(v) => setFxValue("pulseSpeed", v)}
              display={`${fx.pulseSpeed.toFixed(1)}s`}
            />

            <hr className="card-lab-divider" />

            <FxRow label="SVG turbulence flicker">
              <input
                type="checkbox"
                checked={fx.turbulenceOn}
                onChange={(e) => setFxValue("turbulenceOn", e.target.checked)}
              />
            </FxRow>
            <FxSlider
              label="Turbulence amount"
              min={0}
              max={40}
              step={1}
              value={fx.turbulence}
              onChange={(v) => setFxValue("turbulence", v)}
              display={`${fx.turbulence}px`}
              disabled={!fx.turbulenceOn}
            />
            <FxSlider
              label="Flicker speed"
              min={0.6}
              max={8}
              step={0.1}
              value={fx.flicker}
              onChange={(v) => setFxValue("flicker", v)}
              display={`${fx.flicker.toFixed(1)}s`}
              disabled={!fx.turbulenceOn}
            />

            <hr className="card-lab-divider" />

            <FxRow label="Cursor-drag hotspot">
              <input
                type="checkbox"
                checked={fx.hotspotOn}
                onChange={(e) => setFxValue("hotspotOn", e.target.checked)}
              />
            </FxRow>
            <FxSlider
              label="Hotspot strength"
              min={0}
              max={1}
              step={0.05}
              value={fx.hotspotStrength}
              onChange={(v) => setFxValue("hotspotStrength", v)}
              display={`${Math.round(fx.hotspotStrength * 100)}%`}
              disabled={!fx.hotspotOn}
            />

            <hr className="card-lab-divider" />

            <FxRow label="Ember particles">
              <input
                type="checkbox"
                checked={fx.embersOn}
                onChange={(e) => setFxValue("embersOn", e.target.checked)}
              />
            </FxRow>
            <FxSlider
              label="Ember density"
              min={0}
              max={30}
              step={1}
              value={fx.emberDensity}
              onChange={(v) => setFxValue("emberDensity", v)}
              display={`${fx.emberDensity}`}
              disabled={!fx.embersOn}
            />
          </div>

          <div className="card-lab-panel">
            <div className="card-lab-panel-head">
              <h3>Export</h3>
            </div>
            <pre className="card-lab-export">{exportCss(fx)}</pre>
          </div>
        </div>
      </div>
    </section>
  );
}

function FxRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="card-lab-fxrow">
      <span>{label}</span>
      {children}
    </label>
  );
}

function FxSlider({
  label,
  min,
  max,
  step,
  value,
  onChange,
  display,
  disabled,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  display: string;
  disabled?: boolean;
}) {
  return (
    <label className={`card-lab-slider${disabled ? " is-disabled" : ""}`}>
      <span className="card-lab-slider-label">
        {label}
        <em>{display}</em>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function exportCss(fx: FxSettings) {
  return [
    `.sandbox-event-card.is-fired {`,
    `  --fire-color: ${fx.color};`,
    `  --fire-intensity: ${fx.intensity};`,
    `  --fire-speed: ${fx.pulseSpeed}s;`,
    `  --fire-turbulence: ${fx.turbulence}px;`,
    `  --fire-flicker: ${fx.flicker}s;`,
    `  --fire-hotspot: ${fx.hotspotOn ? fx.hotspotStrength : 0};`,
    `}`,
    `/* glow:${fx.glowOn} turbulence:${fx.turbulenceOn} hotspot:${fx.hotspotOn} embers:${fx.embersOn}(${fx.emberDensity}) */`,
  ].join("\n");
}
