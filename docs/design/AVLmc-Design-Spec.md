# AVLmc (Asheville Music Connection) - Design & UX/UI Specifications

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

## 4. UX & Motion Design (Framer Motion)
- **Animations:** Transitions must feel snappy, physical, and cohesive. Uses `motion/react` with spring physics for sliding elements (`type: "spring", damping: 25, stiffness: 200`).
- **Micro-Interactions:** 
  - Action buttons require tactile feedback (`whileTap={{ scale: 0.95 }}`).
  - Icons inside buttons feature subtle transform animations (e.g., the 'X' button rotates 90 degrees on hover).
  - Hovering a card smoothly translates inner floating content upward (`-translate-y-10`) slightly if space needs to be made, ensuring the overlay doesn't obscure vital card information.