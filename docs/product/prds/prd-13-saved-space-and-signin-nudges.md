# PRD 13: The Saved Space & Sign-In Nudges

Part of the [Saved/Favorites & Genre Initiative](../saved-favorites-genre-prd.md). Cycle **C2** (Track A). Satisfies desired outcomes **1 (A personal home for the music you care about)** and **3 (Signing in is encouraged, not required to browse)**.

## Summary

Give the saves from C1 a home and a reason to exist. This cycle delivers the **Saved space** — a private view with separate, scannable lists of saved events, venues, and artists — and the **action-preserving sign-in nudge** that gently invites anonymous people to sign in when they fire, plan, or remove an event, completing their action rather than discarding it. Together these turn "saving works" (C1) into "saving feels worth it, and signing in pays off immediately."

## Implementation Status

**Planned.** Depends on C1 (`saved_items`, `lib/saved-items.ts`, `/api/me/saved-items`).

## Goals

- A signed-in listener has a dedicated **Saved** space reachable from primary navigation, with three clearly separated lists: **Events**, **Venues**, **Artists**.
- Each list item shows enough to recognize it (event: title + date + venue; venue: name; artist: name) and supports open + un-save in one tap, with empty states per list.
- Anonymous users who fire / plan-to-go / remove an event get a gentle, dismissible **sign-in nudge** framed as "keep this and tune your recommendations."
- The nudge **preserves the pending action** through sign-in and replays it once, so signing in completes the fire/plan/remove (and offers to save) rather than starting over.
- Nudges never gate browsing, reacting, or contributing.

## Non-Goals

- No change to how favorites influence ranking — that is C3.
- No public profiles or sharing of the Saved space.
- No new saved *types* beyond C1's event/venue/artist.
- No nagging: the nudge is rate-limited/dismissible, not a modal wall.

## Requirements

### The Saved space (`app/saved/page.tsx` + `components/saved/`)

- A signed-in-only route (`requireUserId()`; redirect anonymous visitors to sign-in with a return path), `dynamic = "force-dynamic"`, server-loaded via `listSavedItems(userId)` from C1.
- Three labeled sections — Events, Venues, Artists — each independently scannable, with per-section counts and empty states ("No saved venues yet — tap the bookmark on a venue to keep it here").
- **Events** link to their detail page and show title, date, venue; **venues**/**artists** link to a filtered board view (e.g. the board scoped to that venue/artist) so a saved item is actionable.
- Each row has an inline un-save (reusing C1's `SaveButton`) with optimistic update.
- Reachable from primary navigation/account menu (e.g. alongside `components/ListenerProfileButton.tsx` / `MusicAccountPanel`), visible only when signed in.
- Mobile-first layout; lists degrade legibly on small screens.

### Sign-in nudge (action-preserving)

- Triggered when an **anonymous** user performs fire / plan / remove on an event (the existing `/api/discovery/event-action` anonymous path still executes — the action is not blocked).
- Surfaces a gentle, dismissible prompt: "Sign in to keep this and tune your recommendations." Dismissal is remembered for the session so it does not re-nag on every action.
- **Action preservation:** the pending action (event id + action type) is carried through the OAuth round-trip — e.g. encoded in the sign-in `callbackUrl` / stored against the anonymous session — and **replayed exactly once** after successful sign-in, then cleared. On replay, offer to also **Save** the event (one tap), connecting the nudge to the Saved space.
- Idempotent replay: replaying must not double-apply (reuse the existing per-person event-state semantics so a re-applied fire/plan is a no-op if already set).

### Merge on sign-in

- When an anonymous person signs in, their existing anonymous fire/plan/remove state (cookie-backed `event_person_event_state`) continues to be honored by the existing merged-memory model; the nudge's replayed action simply ensures the just-taken action is attributed to the now-signed-in account. No saved items are created without an explicit save tap.

### Architecture & docs

- Register the `/saved` route and any new loader in `lib/system-registry.ts`; regenerate the system map; `npm run test:registry` passes.
- Refresh the dated admin/nav screenshots only if a portal surface changes (reminder per workflow; not automated).

## Dependencies

- **C1 (PRD 12):** `saved_items`, `lib/saved-items.ts` (`listSavedItems`, `SaveButton`), `/api/me/saved-items`.
- Existing auth/sign-in flow (NextAuth Spotify), `requireUserId()`, anonymous session cookie, and `/api/discovery/event-action`.
- `components/ListenerProfileButton.tsx` / `MusicAccountPanel` for the entry point.

## Risks

- **Lost action across OAuth redirect** — mitigated by encoding the pending action in the sign-in callback and replaying once with idempotent semantics.
- **Nudge fatigue** — mitigated by session-scoped dismissal and rate limiting; the nudge is never a blocking modal.
- **Double-apply on replay** — mitigated by reusing idempotent event-state writes.
- **Empty Saved space feels dead** — mitigated by helpful empty states that teach the save affordance.

## Acceptance Criteria

- A signed-in user sees a Saved space with separate Events/Venues/Artists lists, accurate counts, working links, inline un-save, and per-list empty states.
- The Saved route is inaccessible to anonymous users (redirect to sign-in with return path).
- An anonymous fire/plan/remove still applies **and** shows a dismissible sign-in nudge.
- After signing in from the nudge, the pending action is applied once to the account and the user is offered a one-tap save; no duplicate application occurs.
- Browsing, reacting, and contributing remain fully available without signing in.
- New route/loader registered; `npm run test:registry` passes; new code passes Snyk; $0.

## Test Scenarios

- Save items of each type, open `/saved` → all three lists render with correct counts and links; un-save from the list removes the row live.
- Visit `/saved` anonymously → redirected to sign-in, returned to `/saved` after.
- Anonymous user taps Fire → event is fired AND a nudge appears; dismiss it → it does not reappear that session.
- Anonymous user taps Plan → signs in via the nudge → returns to find the event planned on their account and a one-tap save offered; the action is not double-applied.
- An anonymous user with prior cookie state signs in → existing state is preserved (merged), not lost.
- Each list's empty state renders when that type has no saves.
