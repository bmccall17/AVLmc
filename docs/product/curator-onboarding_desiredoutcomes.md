## Curator & Influencer Onboarding — Desired Outcomes

Updated: June 17, 2026

### Purpose & Posture

**Goal.** Let an interested listener become an **active, self-sufficient curator** without an admin in
the loop — a guided self-serve path from "I want to curate" → promoted → persona set up → first picks
made → managing their own picks over time — while keeping the surface spam-resistant, privacy-safe, with
**no pay-to-play**, and admin oversight retained.

This is a **Phase 12 follow-up** that completes the curator story. Phase 12 (Social / Curator Graph,
PRDs 23–27) shipped **admin-promoted** curator profiles: the only way to become a curator today is an
admin typing a user id + handle into `CuratorAdminPanel` (`promoteCurator`), and the only way a curator's
picks get added is an admin calling `addCuratorPick` (`app/api/admin/curators`). The locked Phase 12
posture deliberately deferred self-serve onboarding ("admin-promoted at first; self-serve onboarding
deferred to later"). This initiative **un-defers** it and closes the loop so a curator can run their own
profile. It grades against the same surfaces (Recommendation Insight, the Social & Curator Benchmark from
PRD 27) and stays inside the same privacy/no-pay-to-play/`$0` guarantees.

**Current state (brownfield).**

- **Curators are admin-only.** `curators` (`handle`, `display_name`, `bio`, `avatar_url`, `status`
  active/hidden, `promoted_by_admin`) and `curator_picks` exist (`lib/curators.ts`, `lib/curators-core.ts`).
  Promotion and every pick are admin actions via the admin-cookie-gated `app/api/admin/curators`.
- **No listener-side path exists.** A signed-in listener has no way to request, gain, or manage curator
  status. The public directory (`/curators`) ranks by visible pick count, so a curator with no picks is a
  weak, empty surface — there is no activation step.
- **The graph + auth spine is ready.** `requireUserId()` / `getOptionalUserId()` (`lib/current-user.ts`)
  gate the `app/api/me/*` namespace; following a curator already reuses the C1 `listener_follows` edge.
- **Pure validation is reusable.** `isValidHandle` / `normalizeHandle` / `cleanDisplayName` / `cleanBio`
  (`lib/curators-core.ts`) already shape and validate a persona safely; public reads filter `status='active'`,
  so any non-active row is invisible by construction.
- **Threshold-gating is an established pattern.** The roadmap's **Scaling Milestones & Tracking** table
  already gates behaviors on WAU / volume thresholds — the model this initiative reuses for its safety valve.

**Posture (locked).**

- **Instant under a gate, reviewed above it.** While the platform is small, self-serve promotion is
  **instant** (no admin in the loop); once it crosses a configured gate (`> X users` **or** `> Y active
  curators`), new self-serve requests fall back to an **admin-reviewed pending queue**. The gate is a
  tunable constant recorded in the Scaling Milestones table. *(Confirmed with product owner, Jun 17 2026.)*
- **Self-authored persona.** The applicant chooses their own handle / display name / bio / avatar / short
  pitch, validated by the existing pure rules; an admin can still edit, hide, or demote.
- **Admin oversight is never removed.** Even in instant mode, admins retain demote/hide and the review
  queue; self-serve rows are marked `promoted_by_admin = false` so the two paths are distinguishable.
- **No pay-to-play.** No code path lets money set, raise, or bias curator status or rank.
- **Privacy-first.** Applications are private to the applicant + admin; regular (non-curator) listeners
  never get a public profile; no tokens/PII in any public/community/OG response; no Spotify writes.
- **`$0` & security-at-inception.** No new paid service; additive, `42P01`-tolerant schema; all new
  first-party code passes a Snyk scan before "done."
- **Anonymous-first preserved.** Onboarding is an optional, signed-in add-on; the anonymous board payload
  and ranking are unchanged.

---

### 1. Self-Serve Promotion (threshold-gated)

Done looks like a signed-in listener becoming a curator **without an admin in the loop** while the platform
is small: instant promotion under the gate, an **admin-reviewed pending queue** once the gate
(`> X users` / `> Y active curators`) is crossed. Self-serve rows are marked `promoted_by_admin = false`;
an admin can always demote or hide. This replaces "the only way in is an admin typing your user id."

The gate predicate is pure and unit-tested; its thresholds are tunable constants recorded alongside the
roadmap's Scaling Milestones. No pay-to-play; admin oversight is retained at every level.

---

### 2. Guided Persona Setup (the apply/onboarding flow)

Done looks like a clear, friendly **apply flow** where a listener authors their curator persona — a
URL-safe handle (validated with helpful errors), display name, bio, optional avatar, and a short "why me"
pitch — with obvious entry points (the `/curators` directory and the signed-in profile menu) and an
anonymous → sign-in nudge. The flow tells the listener honestly whether they'll go live instantly or land
in review (reflecting the gate), and shows their current status if they've already applied or been promoted.

Reuses the existing `isValidHandle` / `cleanDisplayName` / `cleanBio` rules; nothing about an application
is ever public.

---

### 3. First-Pick Activation

Done looks like a newly promoted curator being guided to add their **first picks immediately**, so their
profile is useful from minute one rather than an empty page in a directory that ranks by pick count. The
onboarding hands off straight into "pick your first few shows," and a curator with zero visible picks is
gently surfaced (to themselves, and in the admin oversight view) as not-yet-activated.

---

### 4. Curator Self-Management

Done looks like a promoted curator **managing their own profile and picks** — add/remove a pick, edit their
bio/display name/avatar — from a curator-owned surface, instead of every change routing through an admin.
This closes the loop so onboarding produces a **self-sufficient** curator. It is built on a new
`requireUserId()`-gated, curator-owned API (distinct from the admin route), and a curator can only ever
manage **their own** persona and picks. Admin moderation (hide a curator / hide a pick) still overrides.

---

### 5. Guardrails & Oversight at Scale

Done looks like the onboarding surface staying **healthy as it grows**: the threshold gate as the primary
anti-spam valve, handle safety + one-persona-per-user enforced, applications kept private, regular listeners
never getting a public profile, **no money path** to status or rank, and admin oversight (a pending-review
queue, demote/hide, and a read of curator growth / not-yet-activated curators) always available. The
existing Social & Curator Benchmark (PRD 27) and Recommendation Insight remain the place curator influence
is read separately from anonymous popularity.

---

### Locked Decisions

- **Promotion:** instant self-serve **under a configurable gate** (`> X users` / `> Y active curators`),
  admin-reviewed above it; admin demote/hide retained at all times; self-serve rows flagged
  `promoted_by_admin = false`.
- **Persona:** applicant self-authors handle / display name / bio / avatar / pitch (admin may edit).
- **Self-management:** a curator manages their own picks + persona via a `requireUserId()`-gated,
  curator-owned API — never another curator's.
- **No pay-to-play; no Spotify writes; `$0`; Snyk-clean; anonymous-first preserved.**
- **Privacy:** applications are private to applicant + admin; no public profile for non-curator listeners;
  no tokens/PII in public responses.
- **Docs/workflow:** formalized as an EPIC (`curator-onboarding-prd.md`) + cycle PRDs (numbering continues
  from 28); recorded via `/ship`.

### Acceptance (initiative-level)

- A signed-in listener can become a curator self-serve — instantly under the gate, via an admin-reviewed
  queue above it — by authoring their own persona; an admin can demote/hide and review.
- The apply flow validates the persona, has clear entry points, nudges anonymous users to sign in, and
  honestly reflects instant-vs-review based on the gate.
- A newly promoted curator is guided to add first picks; a zero-pick curator is surfaced as not-activated.
- A promoted curator can manage their own picks + persona from a curator-owned surface; admin moderation
  overrides.
- The gate is unit-tested and recorded in the Scaling Milestones table; no public profile for regular
  listeners; no tokens/PII in public responses; no pay-to-play path exists; no Spotify writes; `$0`
  maintained; new code passes Snyk.
