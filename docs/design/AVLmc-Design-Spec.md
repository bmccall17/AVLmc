# AVLmc (Asheville Music Connection) - Design & UX/UI Specifications

> **Implementation note (read first).** This spec describes the **target visual language**. The Tailwind
> utility class names (`bg-zinc-900`, `backdrop-blur-xl`, `font-black`, `text-8xl`, …) and the framer-motion
> references (`motion/react`) below are **illustrative shorthand for the intended look** — the project does
> **not** use Tailwind or framer-motion. The actual implementation is **plain CSS driven by custom
> properties** in a single stylesheet, `app/globals.css` (Next.js App Router, no CSS-in-JS). When building or
> reviewing UI, translate the class-name shorthand into the real **design tokens + route-shell contract** in
> **§5. Design Tokens & Theming**, which is the authoritative, code-accurate reference.

## 1. Overview
**AVLmc** is a music event discovery web application focused heavily on social discovery. The design language acts as a curated, high-contrast journal. It relies on a sleek monochrome palette, glassmorphism overlays, and precise typography to maintain high information density while keeping the overall UI strikingly minimal.

## 2. Core Aesthetic & Styling
- **Theme:** Dark mode exclusively. Sleek, high-contrast journal aesthetic.
- **Color Palette:** 
  - **Backgrounds:** Deep true black (`#0A0A0A`) serves as the core foundation.
  - **Surfaces & Borders:** Variations of Zinc (`zinc-900`, `zinc-800/50`) to create depth and structure without introducing stray hues.
  - **Text:** Crisp white for primary data; `zinc-400` and `zinc-500` for secondary and tertiary information.
  - **Accents:** Reserved strictly for active interaction states (e.g., Orange `bg-orange-500` for "Fire"/trending, Rose `text-rose-500` for removing/dismissing).
- **Typography:** 
  - **Font:** Modern Sans-serif.
  - **Headers:** Rely on heavy/black weights (`font-black`) with tight letter spacing (`tracking-tight` or `tracking-tighter`).
  - **Metadata:** Dates, labels, and tags utilize extreme uppercase tracking (`uppercase tracking-widest`, `text-[9px]` or `text-[10px]`) to give the UI a technical, editorial feel.
- **Glassmorphism:** Heavy use of backdrop blurs (`backdrop-blur-md`, `backdrop-blur-xl`) paired with semi-transparent blacks/zinc (`bg-black/40`, `bg-zinc-900/20`) allowing images and ambient background glows to bleed through subtly.

## 3. Key Layouts & Components

### A. "Community Pulse" (Hero Section)
- **Visuals:** Massive, leading-compressed typography (`leading-[0.85]`, up to `text-8xl`) dominating the upper fold.
- **Controls:** High-contrast embedded search inputs and filter buttons nested within dark, slightly translucent backgrounds (`bg-zinc-900/30`). 
- **Structure:** Pairs the primary value prop alongside the "Social Discovery Beats" column for immediate engagement.

### B. Main Event Cards
- **Layout:** Fixed `aspect-[4/5]` ratio to maintain a flawless grid structure.
- **Background:** Full-bleed imagery with a dark bottom-to-top gradient overlay (`bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/10`) ensuring text legibility.
- **Top Overlay:** Floating, pill-shaped badges for genre and match scores (`bg-zinc-100` for primary focus, glassmorphic for secondary data).
- **Bottom Overlay:** Integrated content including dates, titles, location, and a mini "Social Pulse" (overlapping friend avatars/attendee counts).
- **Hover State:** Triggers internal content animations (expanding to reveal a user note snippet), gently scales the background image (`scale-105`), and summons the Action Bar.

### C. "Social Discovery Beats" (Mini-Tiles)
- **Layout:** Dense, horizontal flex layout with a square 24x24 thumbnail on the left and high-density metadata on the right.
- **Container:** Glassmorphic bases (`bg-zinc-900/20`) with a subtle `border-zinc-800/50` stroke.
- **Visuals:** Left-aligned thumbnails feature an inner gradient shadow and absolute-positioned hot-tags (e.g., "HOT Pick", "Rising Heat").

### D. Flush Bottom Action Bar (The "Hover" Panel)
- **Structure:** A proportional, 3-segment flex container fixed to the absolute bottom (Going `flex-[3]`, Fire `flex-[2]`, Remove 'X' `flex-[1]`).
- **Styling:** Ultra-skinny, flush against the component's outer edges, exactly `h-10`, separated by 1px borders (`gap-px`).
- **Interaction (Crucial):** Slides up from `y: "100%"` to `y: 0` exclusively on hover. It uses `absolute inset-x-0 bottom-0 z-20` positioning so it layers *directly over* the existing glassmorphism content. It must never push inner content up, alter the card's outer dimensions, or leave empty black layout gaps.

## 4. UX & Motion Design (target language)
> *Implementation reality:* the project does **not** use framer-motion / `motion/react`. Motion is achieved
> with CSS transitions/animations and small bits of state in React. The values below describe the **intended
> feel**; implement them with CSS (`transition`, `@keyframes`, `transform`) unless/until a motion library is
> deliberately adopted.

- **Animations:** Transitions must feel snappy, physical, and cohesive. The target is spring-like sliding for moving elements (e.g. an action bar sliding up from `translateY(100%)` to `0`).
- **Micro-Interactions:** 
  - Action buttons require tactile feedback (a brief scale-down on press).
  - Icons inside buttons feature subtle transform animations (e.g., the 'X' button rotates 90 degrees on hover).
  - Hovering a card smoothly translates inner floating content upward slightly if space needs to be made, ensuring the overlay doesn't obscure vital card information.

## 5. Design Tokens & Theming (Implementation — authoritative)

This is the **code-accurate** reference. All theming lives in `app/globals.css` as **CSS custom properties**
(no Tailwind). Components read tokens via `var(--token)`; colors are not hard-coded element-by-element.

### A. Token vocabulary

The light-era `:root` tokens define the *defaults* (and remain because some surfaces still use them):

| Token | Light `:root` value | Meaning |
| --- | --- | --- |
| `--bg` | `#f8faf9` | page background |
| `--ink` | `#11201c` | primary text |
| `--muted` | `#5b6b66` | secondary/tertiary text |
| `--line` | `#d9e2de` | hairline borders |
| `--panel` | `#ffffff` | raised surface |
| `--teal` / `--teal-dark` | `#087f8c` / `#055f69` | primary action |
| `--gold` | `#f0a93a` | support/accent |
| `--border` / `--surface` | *(unset at `:root`)* | dark-shell aliases used with fallbacks |

`html` paints a **dark→light gradient** for the first `26rem` ("Concept direction refresh"), so any page that
renders on a **dark** background must establish a **dark token context** or its text will inherit the
near-black `--ink` and become unreadable (the June 25 audit failure).

### B. The dark route-shell contract (the rule for every non-home surface)

Per **§2 (dark mode exclusively)**, non-home routes opt into the dark language by adding a **route-shell
class** to their page `<main>`. That class **re-declares the tokens as dark on the wrapper itself**, so every
descendant reading `var(--ink/--muted/--panel/--line/--border/--surface)` flips to dark automatically — and a
fixed, full-bleed `#0A0A0A` `::before` (`position: fixed; inset: 0; z-index: -1`) covers the light part of the
gradient so the surface never drifts mid-page:

```css
.curators-directory-shell,
.admin-curators-shell,
.auth-recovery-shell,
.not-found-shell,
.error-shell {
  --ink: #fafafa;            /* primary text  */
  --muted: #a1a1aa;          /* secondary text */
  --line: rgba(63,63,70,.7); /* hairline       */
  --panel: rgba(24,24,27,.9);
  --border: rgba(63,63,70,.7);
  --surface: rgba(24,24,27,.9);
  color: var(--ink);
  min-height: 100vh;
  position: relative;
}
/* + a fixed inset:0 z-index:-1 ::before painting #0A0A0A behind the page */
```

The pre-existing full-bleed dark surfaces — `.sandbox-shell` (home + discovery sandbox) and `.admin-shell`
(admin login + portal) — are the precedent this generalizes.

### C. Rules of the road (so the system can't regress)

1. **Never rely on bare `.shell` for color.** It sets only `max-width`/`padding`; on the dark gradient its
   inherited `--ink` is unreadable. A dark route **must** carry a route-shell class.
2. **Opt in by class, theme by token.** To add a new dark route, add it to the route-shell group above (or
   give it the same token re-declaration) — do **not** hard-code colors on each element.
3. **Re-declare tokens on the wrapper, not on `:root`/`.shell`.** Scoping the dark values to named shell
   classes keeps surfaces that legitimately want light (white `--panel`) from being darkened.
4. **Accent discipline (from §2).** Crisp white/zinc for data; teal for primary actions; gold for support;
   orange/rose reserved for interaction states (trending/dismiss). No stray hues.
5. **Failure surfaces are first-class.** The route error boundary, 404, and auth recovery are dark route
   shells too (`.error-shell`, `.not-found-shell`, `.auth-recovery-shell`) — they must be verified at desktop
   **and** `390px` mobile, with action buttons that wrap rather than overflow.