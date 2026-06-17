# PRD 32: First-Pick Activation

Part of the [Curator Onboarding & Self-Management initiative](../curator-onboarding-prd.md) (Phase 13).
Cycle **C4** (fourth of five). Satisfies desired outcome **3 (First-Pick Activation)**. Depends on **C2
(PRD 30 — the apply flow)** and **C3 (PRD 31 — self-pick capability)**.

## Goal

**Guide a newly promoted curator straight into adding their first picks, so their profile is useful from minute
one rather than an empty entry in a directory that ranks by pick count — and surface a zero-pick curator (to
themselves and in admin oversight) as not-yet-activated.**

C2 ends onboarding at "you're a curator"; C3 gives the self-pick capability. This cycle connects them into an
activation moment and defines what "activated" means.

## Summary

The apply-flow success state (C2) hands directly into a **first-picks step** that reuses C3's self-pick API:
a lightweight "pick your first few shows" prompt (search/select from upcoming events, add a note) shown
immediately after instant promotion and on the curator's own management surface while they have zero visible
picks. "Activated" is defined as **≥ 1 visible pick**; a not-activated curator sees a persistent, friendly
nudge, and the admin oversight view (C5) can read the not-activated set. The public directory already ranks by
pick count, so activation directly improves the curator's standing without any ranking change.

## Implementation Status

**Shipped (June 17, 2026).**

Delivered:
- **Pure core** — `isCuratorActivated(visiblePickCount)` (≥ 1), unit-tested and shared by the UI and
  the C5 oversight read.
- **Service** (`lib/curators.ts`) — `getMyCurator` now returns `visiblePickCount` + `activated`;
  added `listNotActivatedCurators()` (active curators with 0 visible picks) for the C5 admin read.
- **First-picks step** — the manage surface (`CuratorManagePanel`) gets a search/select over
  upcoming events (passed in from `getUpcomingEvents()` on the page — no new pick API or endpoint)
  to add a first pick with an optional note via C3's `/api/me/curator`. Deliberate choice only; no
  auto-suggested picks. The apply-flow success state (C2) hands an instantly-promoted curator
  straight here ("Add your first picks").
- **Not-activated nudge** — a persistent, friendly "you have no visible picks yet — add one to
  appear in the directory" nudge on the curator's own manage surface and on their profile-as-owner;
  it clears once they have a visible pick and disappears for moderated rows.
- **Quality** — no public-facing change (an empty curator simply has no picks; directory ordering by
  pick count unchanged). No new registry node. `isCuratorActivated` unit-tested (`test:curators`, 11
  pass); typecheck + lint clean; new code Snyk-clean; `$0`.

## Goals

- After instant promotion, a curator is prompted to add first picks in the same flow (reusing C3's self-pick).
- A curator with **zero visible picks** sees a clear "add your first pick to go live in the directory" nudge.
- "Activated" = ≥ 1 visible pick; the not-activated state is derivable for the C5 admin oversight read.
- No empty-profile dead-ends: every path from promotion points at first picks.

## Non-Goals

- **No** new pick store or pick API — reuse C3's `app/api/me/curator` self-pick.
- **No** auto-generated/auto-suggested picks beyond surfacing upcoming events to choose from (no algorithmic
  "picks for you" — picks must be the curator's deliberate choice; keeps "no pay-to-play / authentic" intact).
- **No** ranking change; **no** change to public directory ordering (it already sorts by pick count).
- **No** admin oversight UI here — C5 owns the admin not-activated read (this cycle exposes the signal).

## Requirements

### Service — `lib/curators.ts` / `lib/curators-core.ts`

- A pure `isCuratorActivated(visiblePickCount: number): boolean` (≥ 1) — unit-tested, reused by UI + the C5
  oversight read.
- Reuse `getMyCurator` (C3) to know the caller's own visible pick count; optionally a small
  `listNotActivatedCurators()` (active curators with 0 visible picks) for C5 to consume.

### Frontend

- **First-picks step** in the apply success flow (C2): an event search/select (reuse the existing event
  lookup the admin pick form uses, or the board's search) → add pick (note optional) via C3's API → live
  confirmation. Skippable, but re-surfaced until activated.
- **Not-activated nudge** on the curator's own management surface (C3) and profile-as-owner: "You have no
  visible picks yet — add one to appear in the directory."
- No public-facing change for viewers (an empty curator simply has no picks, as today).

### Architecture & quality

- No new backing file/table → no new registry node (UI + a pure helper over C3's route). Bump touched docs.
- Unit-test `isCuratorActivated`; Snyk scan any new client code; `$0`.

## Dependencies

- **C2 (PRD 30)** — the apply flow + success hand-off point.
- **C3 (PRD 31)** — the self-pick API (`app/api/me/curator`) the activation step drives.
- The existing event search/lookup used by the admin pick form / board.

## Risks

- **Friction at the worst moment.** Over-gating activation could deter new curators. Mitigated by making
  first-picks **skippable** but re-surfaced (a nudge, not a wall).
- **Empty-directory dilution persists if ignored.** Mitigated by the persistent nudge + the C5 oversight read,
  not by hiding zero-pick curators (they remain followable; only weak).
- **Inauthentic picks.** Mitigated by no auto-suggested/algorithmic picks — the curator chooses deliberately.

## Acceptance Criteria

- Immediately after instant promotion, a curator is prompted to add first picks and can complete one inline.
- A zero-visible-pick curator sees a not-activated nudge on their own surfaces; once they add a visible pick the
  nudge clears and they rank in the directory.
- `isCuratorActivated` is unit-tested; the not-activated set is derivable for C5; Snyk-clean; `$0`; public
  directory ordering unchanged.

## Test Scenarios

- New curator (instant) lands on first-picks → adds pick for event E → E shows "curated by …", curator now
  ranks above zero-pick curators in `/curators`.
- Curator skips first picks → sees the not-activated nudge on next visit to their management surface.
- Curator with picks → no nudge; `isCuratorActivated` true.
- Hiding the only visible pick returns the curator to not-activated (nudge reappears).
