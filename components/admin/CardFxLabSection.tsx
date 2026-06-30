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
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
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

// Same copy as the live action tooltips (EventBoard.tsx `actionHelp`).
const ACTION_HELP: Record<
  "going" | "fire" | "remove",
  { title: string; body: string; impact: string }
> = {
  going: {
    title: "Planning to go",
    body: "Adds this show to your intent list and teaches personal discovery to favor similar artists, venues, timing, and tags.",
    impact: "Also raises the public planning count, so other listeners can see that the show has momentum.",
  },
  fire: {
    title: "Fire",
    body: "A stronger positive signal than Going. Use it when a show feels especially relevant, even if you are not committing.",
    impact: "Adds heat to the community signal and can lift the show in social discovery rows.",
  },
  remove: {
    title: "Remove",
    body: "Hides this event from your list and sends a negative taste signal so similar picks show up less often for you.",
    impact: "Aggregate dismissals can help reduce weak recommendations for everyone without exposing who dismissed it.",
  },
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

// `locked` elements can never be hidden (Venue / Title / Date are always shown).
const ELEMENTS: Array<{ key: ElementKey; label: string; locked?: boolean }> = [
  { key: "image", label: "OG image" },
  { key: "tag", label: "Genre tag" },
  { key: "top30", label: "Top 30 badge" },
  { key: "match", label: "Match pill" },
  { key: "date", label: "Date block", locked: true },
  { key: "venue", label: "Venue (kicker)", locked: true },
  { key: "title", label: "Title", locked: true },
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

// Default hover layout (per design): everything on except the four lower-signal badges.
const DEFAULT_VISIBLE: Record<ElementKey, boolean> = {
  ...ALL_VISIBLE,
  intent: false,
  shared: false,
  circle: false,
  curated: false,
};

const LOCKED = new Set(ELEMENTS.filter((el) => el.locked).map((el) => el.key));

// --- fire FX settings --------------------------------------------------------

type FxSettings = {
  glowOn: boolean;
  intensity: number; // 0..1
  color: string; // hex
  pulseSpeed: number; // seconds per rise cycle
  turbulenceOn: boolean;
  turbulence: number; // displacement scale (px)
  flicker: number; // seconds per turbulence cycle
  hotspotOn: boolean;
  hotspotStrength: number; // 0..1
  embersOn: boolean;
};

const DEFAULT_FX: FxSettings = {
  glowOn: true,
  intensity: 0.25,
  color: "#ff6a00",
  pulseSpeed: 5.2,
  turbulenceOn: true,
  turbulence: 27,
  flicker: 7.5,
  hotspotOn: true,
  hotspotStrength: 0.8,
  embersOn: true,
};

const EMBER_PALETTE = ["#ff3d00", "#ff6a00", "#ff9500", "#ffcf33", "#ff2d55"];

const ACTION_BAR_H = 40;

export function CardFxLabSection() {
  const [visible, setVisible] = useState<Record<ElementKey, boolean>>(DEFAULT_VISIBLE);
  const [fx, setFx] = useState<FxSettings>(DEFAULT_FX);

  // live pressed state for the action buttons
  const [going, setGoing] = useState(false);
  const [fired, setFired] = useState(true);
  const [saved, setSaved] = useState(false);

  const cardRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

  // resting vs. hovered preview. In "rest" the card shows its collapsed look and still
  // reveals live on a real mouse hover; "hover" pins it open.
  const [preview, setPreview] = useState<"rest" | "hover">("hover");

  // which elements are actually visible vs. displaced/clipped by another element
  const [seen, setSeen] = useState<Partial<Record<ElementKey, boolean>>>({});

  function shows(key: ElementKey) {
    return LOCKED.has(key) || visible[key];
  }

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
    const edge = 1 - Math.min(x, 100 - x, y, 100 - y) / 50;
    el.style.setProperty("--mx", `${x}%`);
    el.style.setProperty("--my", `${y}%`);
    el.style.setProperty("--edge", edge.toFixed(3));
  }

  // Measure which checked elements are actually visible. An element is "displaced"
  // when it's clipped out of the disclosure overflow, pushed off the card, or hidden
  // behind the action bar — so the lab can flag it even though its toggle is on.
  const measure = useCallback(() => {
    const card = cardRef.current;
    if (!card) return;
    // Displacement only applies once the card is fully revealed; in the resting state
    // the disclosure is intentionally collapsed, so don't flag those as "hidden".
    if (preview === "rest") {
      setSeen({});
      return;
    }
    const cardRect = card.getBoundingClientRect();
    const disclEl = card.querySelector<HTMLElement>("[data-disclosure]");
    const disclRect = disclEl?.getBoundingClientRect();
    const barShown = visible.actions;
    const next: Partial<Record<ElementKey, boolean>> = {};
    card.querySelectorAll<HTMLElement>("[data-el]").forEach((node) => {
      const key = node.dataset.el as ElementKey;
      const r = node.getBoundingClientRect();
      let ok =
        r.width > 1 &&
        r.height > 1 &&
        r.bottom > cardRect.top + 1 &&
        r.top < cardRect.bottom - 1;
      if (ok && node.hasAttribute("data-in-disclosure") && disclRect) {
        if (r.top >= disclRect.bottom - 2) ok = false;
      }
      if (ok && barShown && key !== "actions" && key !== "save") {
        const band = cardRect.bottom - ACTION_BAR_H;
        if (r.top + r.height / 2 >= band) ok = false;
      }
      next[key] = ok;
    });
    setSeen(next);
  }, [visible.actions, preview]);

  useLayoutEffect(() => {
    measure();
    // re-measure after fonts/images settle
    const id = window.setTimeout(measure, 120);
    return () => window.clearTimeout(id);
  }, [measure, visible, going, fired, saved, preview]);

  useEffect(() => {
    const card = cardRef.current;
    if (!card || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(card);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

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

  // Embers represent community FIRE traction and show whenever the event has fire —
  // even if THIS user hasn't fired. The perimeter glow (+ turbulence + hotspot) only
  // ignites once THIS user hits FIRE.
  const fireCount = MOCK.fire + (fired ? 1 : 0);
  const showGlow = fired && fx.glowOn;
  const showEmbers = fx.embersOn && fireCount > 0;
  const showTurb = showGlow && fx.turbulenceOn;
  const showHotspot = showGlow && fx.hotspotOn;
  const showFx = showGlow || showEmbers;
  const emberCount = showEmbers ? fireCount : 0;

  const embers = useMemo(
    () =>
      Array.from({ length: emberCount }, (_, i) => {
        const left = Math.round((i * 53 + 11) % 100);
        const delay = ((i * 0.37) % fx.pulseSpeed).toFixed(2);
        const dur = (3 + ((i * 0.7) % 3)).toFixed(2);
        const size = 3 + (i % 4);
        const color = EMBER_PALETTE[i % EMBER_PALETTE.length];
        return { left, delay, dur, size, color, key: i };
      }),
    [emberCount, fx.pulseSpeed],
  );

  return (
    <section className="admin-section card-lab">
      <header className="card-lab-head">
        <h2>Card FX Lab</h2>
        <p className="admin-meta">
          Prototype the look of discovery event cards. Switch between the Resting and Hover
          states (or just mouse over the card to see the live transition), toggle elements,
          hover the action buttons to see their live tooltips, press them to watch their
          states, and dial in the “on fire” effect. Drag the cursor across the glowing edge
          to feel the turbulence. Production cards are untouched.
        </p>
      </header>

      <div className="card-lab-grid">
        {/* ---------------- preview ---------------- */}
        <div className="card-lab-stage">
          <div className="card-lab-statebar" role="group" aria-label="Card state">
            <button
              type="button"
              className={preview === "rest" ? "is-active" : ""}
              aria-pressed={preview === "rest"}
              onClick={() => setPreview("rest")}
            >
              Resting
            </button>
            <button
              type="button"
              className={preview === "hover" ? "is-active" : ""}
              aria-pressed={preview === "hover"}
              onClick={() => setPreview("hover")}
            >
              Hover
            </button>
          </div>
          <div
            ref={cardRef}
            className={`sandbox-event-card fresh-card card-lab-card${
              preview === "hover" ? " is-revealed" : ""
            }${showGlow ? " is-fired" : ""}${showTurb ? " fx-turbulence" : ""}${
              showHotspot ? " fx-hotspot" : ""
            }`}
            style={cardStyle}
            onPointerMove={handlePointerMove}
            onPointerDown={() => setDragging(true)}
            onPointerUp={() => setDragging(false)}
            onPointerLeave={() => setDragging(false)}
          >
            {/* fire effect layers (pointer-events: none) */}
            {showFx ? (
              <div className="fire-fx" aria-hidden="true">
                {showGlow ? <span className="fire-fx-glow" /> : null}
                {showTurb ? <span className="fire-fx-turb" /> : null}
                {showHotspot ? <span className="fire-fx-hotspot" /> : null}
                {showEmbers ? (
                  <span className="fire-fx-embers">
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
              className={`sandbox-art ${shows("image") ? "has-image" : "is-fallback"}`}
              aria-hidden="true"
              data-el="image"
            >
              {shows("image") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" decoding="async" loading="lazy" src={MOCK.imageUrl} />
              ) : null}
              <span>HG</span>
            </div>

            {/* top row — genre on the left, match pill + Top 30 stacked on the right */}
            <div className="sandbox-card-top">
              <div className="sandbox-card-tags">
                {shows("tag") ? (
                  <span className="sandbox-card-tag" data-el="tag">
                    {MOCK.tag}
                  </span>
                ) : null}
              </div>
              <div className="sandbox-card-top-right">
                {shows("pulse") ? (
                  <div
                    className="sandbox-pulse sandbox-pulse-chip"
                    aria-label="Social pulse"
                    data-el="pulse"
                  >
                    <span className="avatar-stack" aria-hidden="true">
                      <i>M</i>
                      <i>J</i>
                      <i>R</i>
                    </span>
                    <span>{MOCK.songs} songs</span>
                  </div>
                ) : null}
                {shows("match") ? (
                  <strong className="sandbox-match-pill" data-el="match">
                    {MOCK.match}% match
                  </strong>
                ) : null}
                {shows("top30") ? (
                  <span className="sandbox-top30-badge" data-el="top30">
                    <Star aria-hidden="true" size={12} strokeWidth={2.6} />
                    Top 30
                  </span>
                ) : null}
              </div>
            </div>

            {/* body */}
            <div className="sandbox-card-body">
              {/* date / venue / title are locked — always rendered */}
              <div className="sandbox-date" data-el="date">
                <span>{MOCK.weekday}</span>
                <strong>{MOCK.monthDay}</strong>
              </div>
              <p className="card-kicker" data-el="venue">
                {MOCK.venueName}
              </p>
              <h3 data-el="title">{MOCK.eventTitle}</h3>
              {shows("meta") ? (
                <p className="event-meta" data-el="meta">
                  {MOCK.eventTime} · {MOCK.artistName}
                </p>
              ) : null}

              <div className="sandbox-card-disclosure" data-disclosure>
                {shows("note") ? (
                  <p className="sandbox-note" data-el="note" data-in-disclosure>
                    {MOCK.note}
                  </p>
                ) : null}
                {shows("reasons") ? (
                  <div
                    className="reason-row card-reason-row"
                    aria-label="Recommendation reasons"
                    data-el="reasons"
                    data-in-disclosure
                  >
                    {MOCK.reasons.map((reason) => (
                      <span className="reason-badge" key={reason}>
                        {reason}
                      </span>
                    ))}
                  </div>
                ) : null}
                {shows("intent") ? (
                  <div
                    className="intent-mini-row card-intent-row"
                    aria-label="Saved signal sources"
                    data-el="intent"
                    data-in-disclosure
                  >
                    <span className="spotify-source">Spotify {MOCK.spotifySaves}</span>
                    <span>AVLgo {MOCK.ticketClicks}</span>
                  </div>
                ) : null}
                {shows("links") ? (
                  <div
                    className="sandbox-card-links"
                    aria-label="Event links"
                    data-el="links"
                    data-in-disclosure
                  >
                    <a href="#" onClick={(e) => e.preventDefault()}>
                      Details
                    </a>
                    <a href="#" onClick={(e) => e.preventDefault()}>
                      AVLgo <ExternalLink aria-hidden="true" size={13} strokeWidth={2.4} />
                    </a>
                  </div>
                ) : null}
                {shows("shared") ? (
                  <div className="card-lab-shared" data-el="shared" data-in-disclosure>
                    🎵 4 shared songs with you
                  </div>
                ) : null}
                {shows("circle") ? (
                  <span
                    className="circle-badge"
                    title={`${MOCK.circle} from your circle`}
                    data-el="circle"
                    data-in-disclosure
                  >
                    👥 {MOCK.circle} from your circle
                  </span>
                ) : null}
                {shows("curated") ? (
                  <a
                    className="curated-by-badge"
                    href="#"
                    onClick={(e) => e.preventDefault()}
                    data-el="curated"
                    data-in-disclosure
                  >
                    ★ curated by {MOCK.curatedBy}
                  </a>
                ) : null}
              </div>
            </div>

            {/* action bar */}
            {shows("actions") ? (
              <div className="sandbox-action-bar" aria-label="Discovery actions" data-el="actions">
                <button
                  type="button"
                  className="is-going"
                  aria-pressed={going}
                  onClick={() => setGoing((v) => !v)}
                >
                  <CalendarCheck aria-hidden="true" size={16} strokeWidth={2.5} />
                  <span>Going</span>
                  <strong>{MOCK.going + (going ? 1 : 0)}</strong>
                  <LabTooltip action="going" />
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
                  <LabTooltip action="fire" />
                </button>
                <button type="button" className="is-remove" aria-label="Remove">
                  <X aria-hidden="true" size={18} strokeWidth={2.6} />
                  <LabTooltip action="remove" />
                </button>
                {shows("save") ? (
                  <button
                    type="button"
                    className="is-save"
                    aria-pressed={saved}
                    aria-label="Save"
                    onClick={() => setSaved((v) => !v)}
                    data-el="save"
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
                <button type="button" onClick={() => setVisible(ALL_VISIBLE)}>
                  All
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setVisible(
                      ELEMENTS.reduce(
                        (acc, el) => ({ ...acc, [el.key]: Boolean(el.locked) }),
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
              {ELEMENTS.map((el) => {
                const occluded = shows(el.key) && seen[el.key] === false;
                return (
                  <label
                    key={el.key}
                    className={`card-lab-toggle${el.locked ? " is-locked" : ""}${
                      occluded ? " is-occluded" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={shows(el.key)}
                      disabled={el.locked}
                      onChange={(e) =>
                        setVisible((prev) => ({ ...prev, [el.key]: e.target.checked }))
                      }
                    />
                    <span>{el.label}</span>
                    {el.locked ? <em className="card-lab-tag">locked</em> : null}
                    {occluded ? <em className="card-lab-tag is-warn">hidden</em> : null}
                  </label>
                );
              })}
            </div>
            <p className="card-lab-hint">
              <em className="card-lab-tag is-warn">hidden</em> means the element is on but
              displaced behind another element (clipped, pushed off, or under the action bar).
            </p>
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
              <span>This user FIRE&apos;d → ignites the perimeter glow</span>
            </label>
            <p className="card-lab-readout">
              Embers show whenever an event has FIRE traction (even before this user
              fires). The perimeter glow, turbulence, and hotspot only light up once this
              user hits FIRE.
            </p>

            <FxRow label="Perimeter glow (rises upward)">
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
              label="Rise speed"
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
            <p className="card-lab-readout">
              Ember density tracks the FIRE count — currently <em>{emberCount}</em>.
            </p>
          </div>

          <div className="card-lab-panel">
            <div className="card-lab-panel-head">
              <h3>Export</h3>
            </div>
            <pre className="card-lab-export">{exportCss(fx, emberCount)}</pre>
          </div>
        </div>
      </div>

      <LegacyArchiveCard />
    </section>
  );
}

/**
 * Static, non-interactive snapshot of the ORIGINAL card design (pre fire-effect),
 * kept for archival reference: Top 30 + genre on the left, match pill alone on the
 * right, the old social pulse in the body, all secondary badges visible, and the old
 * brightness-only FIRE cue (no glow / embers).
 */
function LegacyArchiveCard() {
  return (
    <div className="card-lab-archive">
      <div className="card-lab-archive-head">
        <h3>Archived — original card design</h3>
        <p className="admin-meta">
          The previous event card, before the fire effect and layout refresh. Kept for
          reference only — not wired to any controls.
        </p>
      </div>
      <div className="card-lab-stage">
        <div className="sandbox-event-card fresh-card is-revealed card-lab-card">
          <div className="sandbox-art has-image" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="" decoding="async" loading="lazy" src={MOCK.imageUrl} />
            <span>HG</span>
          </div>

          <div className="sandbox-card-top">
            <div className="sandbox-card-tags">
              <span className="sandbox-card-tag">{MOCK.tag}</span>
              <span className="sandbox-top30-badge">
                <Star aria-hidden="true" size={12} strokeWidth={2.6} />
                Top 30
              </span>
            </div>
            <strong className="sandbox-match-pill">{MOCK.match}% match</strong>
          </div>

          <div className="sandbox-card-body">
            <div className="sandbox-date">
              <span>{MOCK.weekday}</span>
              <strong>{MOCK.monthDay}</strong>
            </div>
            <p className="card-kicker">{MOCK.venueName}</p>
            <h3>{MOCK.eventTitle}</h3>
            <p className="event-meta">
              {MOCK.eventTime} · {MOCK.artistName}
            </p>
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
            <div className="sandbox-card-disclosure">
              <p className="sandbox-note">{MOCK.note}</p>
              <div className="reason-row card-reason-row">
                {MOCK.reasons.map((reason) => (
                  <span className="reason-badge" key={reason}>
                    {reason}
                  </span>
                ))}
              </div>
              <div className="intent-mini-row card-intent-row">
                <span className="spotify-source">Spotify {MOCK.spotifySaves}</span>
                <span>AVLgo {MOCK.ticketClicks}</span>
              </div>
              <div className="card-lab-shared">🎵 4 shared songs with you</div>
              <span className="circle-badge">👥 {MOCK.circle} from your circle</span>
              <span className="curated-by-badge">★ curated by {MOCK.curatedBy}</span>
            </div>
          </div>

          <div className="sandbox-action-bar" aria-label="Discovery actions">
            <button type="button" className="is-going">
              <CalendarCheck aria-hidden="true" size={16} strokeWidth={2.5} />
              <span>Going</span>
              <strong>{MOCK.going}</strong>
            </button>
            <button type="button" className="is-fire" aria-pressed="true">
              <Flame aria-hidden="true" size={16} strokeWidth={2.5} />
              <span>Fire</span>
              <strong>{MOCK.fire + 1}</strong>
            </button>
            <button type="button" className="is-remove" aria-label="Remove">
              <X aria-hidden="true" size={18} strokeWidth={2.6} />
            </button>
            <button type="button" className="is-save" aria-label="Save">
              <Bookmark aria-hidden="true" size={16} strokeWidth={2.5} fill="none" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LabTooltip({ action }: { action: "going" | "fire" | "remove" }) {
  const help = ACTION_HELP[action];
  return (
    <span className="sandbox-action-tooltip" role="tooltip">
      <strong>{help.title}</strong>
      <span>{help.body}</span>
      <em>{help.impact}</em>
    </span>
  );
}

function FxRow({ label, children }: { label: string; children: ReactNode }) {
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

function exportCss(fx: FxSettings, emberCount: number) {
  return [
    `.sandbox-event-card.is-fired {`,
    `  --fire-color: ${fx.color};`,
    `  --fire-intensity: ${fx.intensity};`,
    `  --fire-speed: ${fx.pulseSpeed}s;`,
    `  --fire-turbulence: ${fx.turbulence}px;`,
    `  --fire-flicker: ${fx.flicker}s;`,
    `  --fire-hotspot: ${fx.hotspotOn ? fx.hotspotStrength : 0};`,
    `}`,
    `/* glow:${fx.glowOn} turbulence:${fx.turbulenceOn} hotspot:${fx.hotspotOn} embers:${fx.embersOn}(${emberCount}) */`,
  ].join("\n");
}
