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
| 5 | Personalized Discovery Backlog | Future | Add filters, sorting, and listening-history personas for best-bet recommendations. |

## Product Principles

- Keep the initial cost at `$0`.
- Prefer low-friction participation over full social networking.
- Do not require accounts for the MVP.
- Treat the primary object as an event unless AVLgo API discovery proves that artist-first is safer.
- Keep AVLgo as the source of truth for event listings.
- Preserve community contributions across event refreshes.
- Make every public page work well on mobile.
- Add authentication only when it unlocks clear value.

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

Purpose: make the large event feed easier to navigate with filters, sorting, and music-taste-aware recommendations.

Candidate outputs:

- Search, venue, date, tag, and popularity filters.
- Sort options such as soonest, most discussed, most reactions, and best match.
- Optional listener persona built from connected Spotify, YouTube Music, or Apple Music history.
- Recommendation scoring that surfaces best bets based on listening history, saved artists, community signals, venue preferences, and event timing.
- Clear privacy controls, including disconnect, delete data, and opt out.
- $0 feasibility review before implementing any music-platform integrations.

## Implementation Reference

See [Architecture Reference](architecture-reference.md) for current routes, components, storage behavior, and the Aiven production persistence path.

## Hard Constraints

- No paid hosting, database, storage, auth, email, transcription, or API services in the first version.
- No paid Apple developer account, paid OAuth provider, or paid media storage unless explicitly approved later.
- No full user accounts in MVP.
- No private messaging, profiles, ticketing, calendar integration, AI summaries, or personalized recommendations in MVP.

## Key Risks

- AVLgo API may not expose enough reliable music-event fields.
- AVLgo may not provide auth or may not support third-party identity flows.
- Spotify and Apple Music auth may not work as general-purpose user identity.
- Apple Music integration may have developer-program or token requirements.
- Free storage may not be enough for voice memos, so audio is excluded from the first production release.
- Anonymous contributions may attract spam.

## Success Criteria

The planning package is ready when:

- Each phase has a focused PRD with scope, requirements, dependencies, risks, and acceptance criteria.
- The master roadmap explains sequencing and ownership of open decisions.
- The `$0` cost constraint is visible in every phase where it matters.
- Deployment and auth are treated as an investigation before implementation choices are locked.
