# AVL Music Companion Master Roadmap

## Desired Outcome

Build a lightweight, zero-cost-first web app that turns upcoming AVLgo music listings into a community-powered discovery board for Asheville shows.

The app should help visitors quickly see who is playing soon, which artists have community context, which shows people are considering, and where to start listening before deciding to go.

## Planning Package

Use this document as the master tracker. The focused PRDs live in `docs/product/prds/`.

| Phase | PRD | Status | Purpose |
| --- | --- | --- | --- |
| 0 | [Deployment and Auth Investigation](prds/prd-05-deployment-auth-investigation.md) | Documented | Choose a $0 starting stack and evaluate future auth options. |
| 1 | [MVP Event Discovery Board](prds/prd-01-mvp-event-discovery-board.md) | Built | Pull AVLgo events and display the rolling 21-day show board. |
| 2 | [Community Contributions and Reactions](prds/prd-02-community-contributions-and-reactions.md) | Built | Add song recs, notes, going signals, and fire signals. |
| 3 | [Admin Moderation](prds/prd-03-admin-moderation.md) | Built | Let a trusted admin hide spam or bad submissions. |
| 4 | [Voice Memos](prds/prd-04-voice-memos.md) | Deferred | Add short audio contributions after a $0 storage path is selected. |
| 5 | [Personalized Discovery Backlog](personalized-discovery-backlog.md) | Built | Add best-bet filters, sorting, and optional Spotify taste-aware recommendations. |

## Product Principles

- Keep the initial cost at `$0`.
- Prefer low-friction participation over full social networking.
- Do not require accounts for the MVP.
- Treat the primary object as an event unless AVLgo API discovery proves that artist-first is safer.
- Keep AVLgo as the source of truth for event listings.
- Preserve community contributions across event refreshes.
- Make every public page work well on mobile.
- Keep authentication optional and add it only when it unlocks clear value.

## Phased Roadmap

### Phase 0: Deployment and Auth Investigation

Purpose: avoid choosing a stack that breaks the `$0` constraint or makes future auth painful.

Required outputs:

- Current free-tier decision memo for hosting, database, storage, and auth: [Deployment and Auth Investigation](deployment-auth-investigation.md).
- Explicit recommendation for the first build stack.
- Auth feasibility notes for Google, plain email, Spotify, Apple Music, and AVLgo.
- Risks around Apple Music and AVLgo auth clearly called out.
- Confirmation that the selected first stack can launch at `$0`.

### Phase 1: MVP Event Discovery Board

Purpose: make the site useful before community features exist.

Required outputs:

- Rolling 21-day list of AVLgo music events.
- Homepage sorted by soonest show first.
- Event detail pages with shareable URLs.
- Basic normalized event store.
- Daily refresh behavior.

### Phase 2: Community Contributions and Reactions

Purpose: add the human layer around the listings.

Required outputs:

- Song recommendations.
- Short text notes.
- "Thinking of going" reaction.
- Fire/excitement reaction.
- Counts visible on homepage cards and detail pages.

### Phase 3: Admin Moderation

Purpose: keep anonymous participation safe enough to run.

Required outputs:

- Password-protected admin page.
- Recent contribution list.
- Hide/unhide controls.
- Basic anti-spam controls.

### Phase 4: Voice Memos

Purpose: support short personal audio context once storage and moderation are ready.

Production status: deferred for the first Vercel/Aiven launch. No voice memo upload or playback surface is active.

Required outputs:

- 60-second max voice memo contribution.
- Browser recording with upload fallback.
- Audio playback on event detail pages.
- Admin ability to hide voice memos.

### Phase 5: Personalized Discovery Backlog

Purpose: make the large event feed easier to navigate with best-bet filters, sorting, and optional Spotify taste-aware recommendations.

Build goal: help a visitor answer "which upcoming show is most worth checking out for me?" from the homepage. Anonymous users should get stronger public-signal recommendations, and Spotify-connected users should get best-match boosts from synced taste rows.

Current production inputs as of June 6, 2026:

- Anonymous browsing, reactions, and contributions remain live and do not require login.
- Optional Spotify sign-in is live on `https://avlmc.vercel.app/`.
- Auth.js, anonymous sessions, community tables, music connection tables, and Spotify profile tables exist in Aiven production.
- A signed-in Spotify account can sync 20 top artists and 20 top tracks into `music_profile_items`.
- OAuth tokens stay server-side in Auth.js `accounts`; discovery code should use normalized profile rows.

Built outputs:

- Ranked search, venue, date, tag, popularity, and intent filters that scale past the large AVLgo venue/tag set.
- Sort options such as soonest, most discussed, hottest, Best Bets, and Spotify-backed Best Match.
- Recommendation scoring based on event timing, community signals, event metadata, and optional normalized Spotify profile rows.
- Clear privacy controls, including sync, disconnect, delete music data, and opt out.
- Manual music links remain available for everyone; provider-backed linking starts with Spotify search/select.
- Google/YouTube and Apple Music remain later connectors.

See [Personalized Discovery Backlog](personalized-discovery-backlog.md) for next-plan notes and acceptance targets.

## Implementation Reference

See [Architecture Reference](architecture-reference.md) for current routes, components, storage behavior, and the Aiven production persistence path.

## Hard Constraints

- No paid hosting, database, storage, auth, email, transcription, or API services in the first version.
- No paid Apple developer account, paid OAuth provider, or paid media storage unless explicitly approved later.
- No required user accounts in MVP; optional music sign-in must not block anonymous browsing or participation.
- No private messaging, profiles, ticketing, calendar integration, AI summaries, or personalized recommendations in MVP.

## Key Risks

- AVLgo API may not expose enough reliable music-event fields.
- AVLgo may not provide auth or may not support third-party identity flows.
- Spotify is working as the first optional music identity/taste connector, but it should not become a required account gate.
- Apple Music auth may not work as general-purpose user identity.
- Apple Music integration may have developer-program or token requirements.
- Free storage may not be enough for voice memos, so audio is excluded from the first production release.
- Anonymous contributions may attract spam.

## Success Criteria

The planning package is ready when:

- Each phase has a focused PRD with scope, requirements, dependencies, risks, and acceptance criteria.
- The master roadmap explains sequencing and ownership of open decisions.
- The `$0` cost constraint is visible in every phase where it matters.
- Deployment and auth are treated as an investigation before implementation choices are locked.
