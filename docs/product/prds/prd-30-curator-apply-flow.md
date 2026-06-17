# PRD 30: Guided Persona Setup & Apply Flow

Part of the [Curator Onboarding & Self-Management initiative](../curator-onboarding-prd.md) (Phase 13).
Cycle **C2** (second of five). Satisfies desired outcome **2 (Guided Persona Setup)**. Depends on **C1
(PRD 29 — the application API + gate)**; independent of C3.

## Goal

**Give a listener a clear, friendly apply/onboarding flow to author their curator persona — handle, display
name, bio, optional avatar, and a short pitch — with obvious entry points, an anonymous → sign-in nudge, and
honest instant-vs-review messaging based on the gate.**

C1 built the application API; this cycle makes it usable: the front-end flow a real listener walks through to
become a curator.

## Summary

A signed-in `/curators/apply` page renders a form (handle / display name / bio / avatar / pitch) that posts to
`POST /api/me/curator-application` and surfaces validation errors inline (reusing the pure rules' messages).
Before submit it reads `GET /api/me/curator-application` to show the listener's current status and whether
they'll **go live instantly** or **be reviewed** (the gate's `selfServeOpen`). Entry points are added to the
`/curators` directory and the signed-in profile menu (`ListenerProfileButton`); anonymous visitors get a
sign-in nudge that returns them to the flow. On instant success the page confirms and links to the new
profile (handing off to first-pick activation, C4); on a queued submit it explains the review step.

## Implementation Status

**Shipped (June 17, 2026).**

Delivered:
- **Apply page** `app/curators/apply/page.tsx` (server-resolves sign-in via `getOptionalUserId`) +
  client `components/CuratorApplyForm.tsx`: authors handle / display name / bio / optional avatar /
  pitch and posts to the C1 `POST /api/me/curator-application`. Inline handle validation (mirrors
  the pure rule), live char counts, disabled-while-submitting, and success/error states surfacing
  the C1 messages (incl. "that handle is already taken").
- **Gate-aware copy.** On load it reads `GET /api/me/curator-application` → renders "go live
  instantly" vs. "an admin reviews new curators right now," and routes by current status: `none` →
  form; `pending` → "in review"; `active` → "you're a curator → view profile" (hand-off to C3).
- **Success hand-off.** Instant promotion confirms + links to `/curator/[handle]` and toward first
  picks (C4); a queued submit explains the review step.
- **Entry points.** "Become a curator" on the `/curators` directory and in the signed-in
  `ListenerProfileButton` menu (beside "View saved").
- **Anonymous nudge.** Anonymous visitors get `signIn("spotify", { callbackUrl: "/curators/apply" })`
  and are returned to the flow; no application data renders for them.
- **Quality.** Avatar URLs are validated to bounded `https:` only (`cleanAvatarUrl`, unit-tested) so
  the self-authored field can't become an SSRF/`javascript:`/`data:` `<img>` vector. No new endpoint
  or registry node (UI over the C1 route). Typecheck + lint clean; new code Snyk-clean; `$0`.

## Goals

- A signed-in listener can author + submit a curator persona from `/curators/apply` with inline validation.
- The flow honestly reflects **instant vs. review** based on the gate, and shows current status if already
  applied/promoted.
- Clear entry points: the `/curators` directory and the signed-in profile menu.
- Anonymous visitors get a sign-in nudge that returns to the flow; nothing about an application is public.

## Non-Goals

- **No** change to the promotion/gate logic — that is C1 (consumed here).
- **No** self-management of picks/persona post-promotion — that is C3.
- **No** first-pick capture yet — the success state links forward; capture is C4.
- **No** admin UI change (the admin review queue is polished in C5).

## Requirements

### Frontend

- **Apply page** `app/curators/apply/page.tsx` + a client form component (e.g. `components/CuratorApplyForm.tsx`):
  fields handle / display name / bio / avatar (optional) / pitch; inline validation surfacing the pure rules'
  errors (`isValidHandle` constraints, length bounds); disabled-while-submitting; success + error states.
- **Gate-aware copy.** Read `GET /api/me/curator-application` on load → render "You'll go live instantly" vs.
  "An admin reviews new curators right now," and show current status (none / pending / active) with the right
  affordance (apply / "your application is in review" / "you're a curator → manage").
- **Entry points.** A "Become a curator" link on `app/curators/page.tsx` (directory) and in
  `components/ListenerProfileButton.tsx` (signed-in menu, beside "View saved").
- **Anonymous nudge.** Anonymous → the existing sign-in affordance with a return path back to `/curators/apply`
  (reuse the saved/follow sign-in-nudge precedent).
- **Success hand-off.** On instant promotion, confirm + link to `/curator/[handle]` and toward first picks
  (C4); on queued, explain the review step and link back to the directory.

### Service / API

- No new endpoints — consumes C1's `GET`/`POST /api/me/curator-application`. (Avatar handling: store
  `avatar_url` as a validated URL string only; no upload/storage — keeps `$0`.)

### Architecture & quality

- No new backing file/table → no new registry node (the page is UI over the C1 route). Bump touched docs.
- Snyk scan the new client + page code; confirm no application data is rendered for anonymous users and no
  PII leaks; `$0`.

## Dependencies

- **C1 (PRD 29)** — `app/api/me/curator-application` + the gate.
- The sign-in-nudge precedent (saved/follow); `ListenerProfileButton`; `app/curators/page.tsx`.

## Risks

- **Confusing instant-vs-review UX.** Mitigated by reading the live gate state and explicit copy.
- **Handle-collision frustration.** Mitigated by inline validation + the "handle taken" message from C1.
- **Accidental public exposure of an application.** Mitigated by `requireUserId()` gating + the `status='active'`
  public filter (no pending row is ever queried publicly).

## Acceptance Criteria

- A signed-in listener completes `/curators/apply` and is promoted (instant) or queued (review) per the gate,
  with accurate copy throughout.
- Validation errors (bad/duplicate handle, over-length bio) surface inline; submit is blocked until valid.
- Entry points exist on the directory and profile menu; anonymous users are nudged to sign in and returned to
  the flow.
- No application data renders for anonymous users; Snyk-clean; `$0`.

## Test Scenarios

- Gate open: signed-in listener fills the form → instant `active` → success screen links to their profile.
- Gate closed: same flow → "in review" confirmation; the directory does not show them yet.
- Already-active curator visits `/curators/apply` → sees "you're a curator" + a manage link (C3), not the form.
- Anonymous visits `/curators/apply` → sign-in nudge, returns to the flow after auth.
- Submit handle `Maya!` → inline validation error; submit a taken handle → "that handle is already taken."
