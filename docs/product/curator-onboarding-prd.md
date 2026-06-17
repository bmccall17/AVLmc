# Curator Onboarding & Self-Management — Master PRD (Epic)

Updated: June 17, 2026

**Status: Shipped (June 17, 2026).** Decomposed into five dependency-sequenced cycle PRDs (29–33),
one per desired outcome — **all five shipped**. This is **Phase 13** in [`master-roadmap.md`](master-roadmap.md)
and a direct follow-up to **Phase 12** (Social / Curator Graph, PRDs 23–27, shipped).

## One-Sentence Goal

Let an interested listener become an **active, self-sufficient curator** through a guided self-serve path —
instant under a configurable gate, admin-reviewed above it — author their own persona, get to first picks,
and manage their own profile over time, all spam-resistant, privacy-safe, with **no pay-to-play** and admin
oversight retained.

## How To Use This Document

This is the umbrella tracker for the Curator Onboarding & Self-Management initiative (**Phase 13**). It
synthesizes the desired outcomes in [`curator-onboarding_desiredoutcomes.md`](curator-onboarding_desiredoutcomes.md)
into a sequenced series of focused PRDs in [`prds/`](prds/) (PRDs **29–33**). Treat it the way
[`social-curator-prd.md`](social-curator-prd.md) serves Phase 12 and [`deeper-personalization-prd.md`](deeper-personalization-prd.md)
serves Phase 11: the epic owns shared architecture, cross-cutting rules, and sequencing; each cycle PRD owns
one independently shippable increment.

This initiative **completes the curator story** opened by Phase 12. Phase 12 / PRD 25 shipped
**admin-promoted** curator profiles and **admin-managed** picks; the locked posture deferred self-serve
onboarding. This initiative un-defers it and adds curator self-management, so a curator can be created and run
entirely without an admin in the loop (while the gate is open), with the admin path preserved as the safety
valve above the gate and as moderation throughout.

## Current State (Brownfield Baseline)

- **Curators + picks are admin-only.** `curators` (`handle`, `display_name`, `bio`, `avatar_url`, `status`
  active/hidden, `promoted_by_admin`) and `curator_picks` exist (`lib/curators.ts`, pure core
  `lib/curators-core.ts`, schema `db/schema.sql`). `promoteCurator` / `addCuratorPick` / `setCuratorStatus` /
  `setPickStatus` are all reached only through the admin-cookie-gated `app/api/admin/curators` +
  `components/admin/CuratorAdminPanel.tsx`.
- **No listener-side path.** A signed-in listener cannot request, gain, or manage curator status; `app/api/me/*`
  has no curator surface. The public directory (`/curators`, `app/curators/page.tsx`) ranks by visible pick
  count, so a pick-less curator is an empty, weak entry — there is no activation step.
- **Public reads already exclude non-active rows.** `listCurators` / `getCuratorProfile` /
  `getCuratedByForEvents` all filter `status = 'active'`, so any `pending`/`rejected` row is invisible by
  construction — the safe foundation for a self-serve queue.
- **Auth + the per-listener API namespace are ready.** `requireUserId()` / `getOptionalUserId()`
  (`lib/current-user.ts`) gate `app/api/me/*` (`follows`, `saved-items`, `listener-preferences`, …). The
  apply + self-management routes plug straight in; `app/api/me/follows` is the route-shape precedent.
- **Pure validation is reusable.** `isValidHandle` / `normalizeHandle` / `cleanDisplayName` / `cleanBio`
  (`lib/curators-core.ts`) shape and validate a persona; unit-tested in `tests/curators.test.ts`.
- **Threshold-gating is an established pattern.** The roadmap's **Scaling Milestones & Tracking** table gates
  behaviors on WAU / volume thresholds — the model the gate reuses.

**Reusable spine every cycle plugs into:** `requireUserId()` + the `app/api/me/*` pattern; the pure
validation/shaping in `lib/curators-core.ts`; the `promoteCurator` upsert + error-mapping precedent and the
`42P01/42703`-tolerant reads in `lib/curators.ts`; the `status='active'` public filter; the admin-moderation
route/panel pattern (`app/api/admin/curators`, `CuratorAdminPanel`); and the System Registry / system-map
discipline.

## Posture (Locked — inherited by every cycle)

- **Instant under a gate, reviewed above it.** Self-serve promotion is **instant** while the platform is
  small; once it crosses a configured gate (`> X users` **or** `> Y active curators`), new self-serve requests
  fall back to an **admin-reviewed pending queue**. The gate is a pure, unit-tested predicate with tunable
  constants recorded in the Scaling Milestones table.
- **Self-authored persona.** Applicant authors handle / display name / bio / avatar / pitch (existing pure
  rules); admin may edit, hide, demote. Self-serve rows are flagged `promoted_by_admin = false`.
- **Admin oversight is never removed.** Demote/hide and the review queue exist at every gate level.
- **Curator self-management is self-scoped.** A curator manages **only** their own persona + picks via a
  `requireUserId()`-gated, curator-owned API distinct from the admin route; admin moderation overrides.
- **No pay-to-play.** No code path lets money set, raise, or bias curator status or rank; re-asserted against
  the PRD 27 invariant.
- **Privacy-first.** Applications are private to applicant + admin; regular listeners never get a public
  profile; no tokens/PII in any public/community/OG response; no Spotify writes.
- **`$0` & security-at-inception.** Additive, `42P01`-tolerant schema; no new paid service/dependency; all new
  first-party code passes Snyk before "done."
- **Anonymous-first preserved.** Onboarding is an optional signed-in add-on; the anonymous board payload and
  ranking stay byte-for-byte unchanged.

## Definition Of Done (Outcomes 1–5, Synthesized)

1. **Self-serve promotion (threshold-gated)** — a signed-in listener becomes a curator without an admin in
   the loop while under the gate, via an admin-reviewed pending queue above it; self-serve rows flagged
   `promoted_by_admin = false`; admin demote/hide retained.
2. **Guided persona setup** — a clear apply flow authoring a validated persona, obvious entry points, an
   anonymous → sign-in nudge, and honest instant-vs-review messaging; applications never public.
3. **First-pick activation** — a newly promoted curator is handed into adding first picks; a zero-pick curator
   is surfaced (to themselves + in admin oversight) as not-activated.
4. **Curator self-management** — a promoted curator manages their own picks + persona from a self-scoped API;
   admin moderation overrides; a curator can never touch another's persona/picks.
5. **Guardrails & oversight at scale** — the gate as primary anti-spam valve, handle-safety +
   one-persona-per-user, private applications, no public profile for regular listeners, no money path to
   status/rank, an admin review queue + curator-growth/not-activated read, and the PRD 27 benchmark reading
   curator influence separately from popularity.

## Outcome → PRD Map

Build order = outcome order (dependency-sequenced: the promotion spine first, the apply flow on it, then
self-management, then activation which hands the flow into self-picking, then the guardrail/oversight capstone).

| Cycle | PRD | Outcome(s) | Theme |
| --- | --- | --- | --- |
| C1 | [PRD 29 — Self-Serve Promotion & Threshold Gate](prds/prd-29-curator-self-serve-promotion.md) | 1 | The spine: a `requireUserId()`-gated `me/curator-application` API, a `pending/rejected` status path on `curators`, and the pure, unit-tested gate predicate that routes instant-vs-review. Nothing public changes. |
| C2 | [PRD 30 — Guided Persona Setup & Apply Flow](prds/prd-30-curator-apply-flow.md) | 2 | The listener-facing apply/onboarding UX: a `/curators/apply` form authoring the persona, entry points (directory + profile menu), sign-in nudge, validation surfacing, status display, honest instant-vs-review copy. |
| C3 | [PRD 31 — Curator Self-Management](prds/prd-31-curator-self-management.md) | 4 | A self-scoped `me/curator` API + surface: a curator adds/removes their own picks and edits their own persona; admin moderation overrides; never touches another curator. |
| C4 | [PRD 32 — First-Pick Activation](prds/prd-32-curator-first-pick-activation.md) | 3 | Hand the apply flow straight into "pick your first shows" (reusing C3's self-pick), and surface zero-pick curators as not-activated to themselves + admin oversight. |
| C5 | [PRD 33 — Guardrails & Oversight at Scale](prds/prd-33-curator-onboarding-guardrails.md) | 5 | The capstone: admin pending-review queue + curator-growth/not-activated oversight, the Scaling Milestones gate row, anti-abuse hardening, the no-pay-to-play re-assertion, and a PII/leak audit of every new surface. |

## Delivery Sequence & Dependencies

```
C1 Self-Serve Promotion & Gate   (the spine; every other cycle plugs in here)
 ├──> C2 Guided Persona Setup / Apply Flow   (UI on the C1 application API)
 ├──> C3 Curator Self-Management             (self-scoped picks + persona on a promoted curator)
 │
 └──> C4 First-Pick Activation   (hands C2's flow into C3's self-pick; zero-pick nudge)
            └──> C5 Guardrails & Oversight at Scale
                   (grades/guards the whole surface; admin queue, gate row, PII audit)
```

- **C1 first** — the application API + `pending/rejected` status path + gate predicate is the spine; it ships
  value on its own (you can apply via the API and be promoted under the gate) without yet changing public UI.
- **C2 depends on C1** — the apply UI needs the application endpoint and the gate state to render correctly.
- **C3 depends on C1** (a promoted curator self-manages); independent of C2, but recommended after it.
- **C4 depends on C2 + C3** — first-pick activation hands the apply flow into the self-pick capability.
- **C5 depends on the rest** — you can only grade/guard a surface that exists; it is the safety capstone.
- **Recommended order:** C1 → C2 → C3 → C4 → C5.

## Shared Architecture & Cross-Cutting Design

Decided once here; inherited by every cycle.

### Reuse the curators spine — no new core table

- The `curators` row is the single record for a persona at any lifecycle stage. Extend its `status` check to
  `('active','hidden','pending','rejected')` and add an `application_note` column (the pitch) — additive,
  `42P01/42703`-tolerant, per the shipped precedent. No new table; `curator_picks` is reused as-is for self-picks.
- `promoted_by_admin = false` distinguishes a self-serve row from an admin promotion. Public reads keep
  filtering `status = 'active'`, so `pending`/`rejected` rows are invisible with no extra work.

### The gate is a pure predicate

- `isSelfServeOpen(activeCuratorCount, userCount, gate)` lives in `lib/curators-core.ts` (unit-tested);
  `getSelfServeAvailability()` in `lib/curators.ts` supplies the live counts. The gate constants
  (`CURATOR_SELF_SERVE_GATE`) are documented in the desired-outcomes doc + the Scaling Milestones table and
  tuned, not guessed.

### Two API planes, never crossed

- **Listener plane** — `requireUserId()`-gated `app/api/me/curator-application` (apply / my status) and
  `app/api/me/curator` (self-management). A listener acts only on **their own** row, resolved from the session
  user id — never an id supplied in the body.
- **Admin plane** — the existing `app/api/admin/curators`, extended for the pending-review queue
  (approve → active / reject → rejected) and retaining promote/demote/hide.

### Privacy & no-pay-to-play by construction

- Applications and pending rows never appear in any public/community/OG response (the `status='active'` filter
  + `requireUserId()` gating). No new code path sets/raises status or rank from a payment field — re-asserted
  against the PRD 27 "no money buys rank" invariant. Regular listeners never get a public profile.

### Explainability & reversibility

- The apply flow tells the listener honestly whether they'll go live now or be reviewed. Promotion is
  reversible (admin demote/hide); a curator can remove their own picks; status is always inspectable via
  `me/curator-application` GET.

### Cross-cutting requirements (apply to every cycle)

- **Privacy / PII (mandatory).** No public profile for non-curator listeners; applications private to applicant
  + admin; no tokens/PII in public responses; OAuth tokens never leave the server.
- **Security at inception (mandatory).** All new first-party code passes a Snyk code scan before "done"; fix +
  rescan until clean. New listener-facing surfaces inherit input validation; admin moderation overrides.
- **No pay-to-play / no Spotify writes.** No money path to status or rank; read-only Spotify scopes only.
- **`$0`.** No new paid hosting/database/storage/API/dependency; additive schema following the
  `db/migrate-missing-tables.sql` precedent.
- **Anonymous-first preserved.** The anonymous board payload + ranking are unchanged at every step.
- **Architecture registration.** Every new route is registered in `lib/system-registry.ts` with a correct
  `sourceOfTruth`; `npm run generate:system-map` re-run; `npm run test:registry` green.
- **Validated, not guessed.** The gate predicate and persona shaping are unit-tested; curator growth is
  readable in admin oversight; curator influence stays graded by the PRD 27 benchmark.

## Cross-Cutting Risks

- **Spam / abuse of a self-serve surface (central risk).** Instant promotion is an open door. Mitigated by the
  threshold gate (auto-falls back to admin review at scale), handle safety + one-persona-per-user, admin
  demote/hide retained, and a private (never public) application record.
- **Pay-to-play creep.** Any "promote me / boost me" pressure. Mitigated by no money path (no purchase sets
  status or rank), the PRD 27 unit-tested invariant, and admin override.
- **Privacy leak.** A listener-authored application + self-management surface is new write surface. Mitigated by
  `requireUserId()` self-scoping (act only on your own row), the `status='active'` public filter, and a C5
  PII/leak audit.
- **Empty-curator dilution.** Self-serve could fill the directory with pick-less profiles. Mitigated by
  first-pick activation (C4) and the not-activated oversight read.
- **Brownfield regression.** Changes touch the curator read/write path and public curator surfaces. Mitigated
  by additive, anonymous-null edits; public reads already exclude non-active rows.

## Initiative-Level Success Criteria

- A signed-in listener can become a curator self-serve — instant under the gate, admin-reviewed above it — by
  authoring their own persona; an admin can demote/hide and review.
- The apply flow validates the persona, has clear entry points, nudges anonymous users to sign in, and reflects
  instant-vs-review honestly; applications are never public.
- A newly promoted curator is guided to first picks; a zero-pick curator is surfaced as not-activated.
- A promoted curator manages their own picks + persona from a self-scoped surface; admin moderation overrides;
  a curator can never touch another's.
- The gate is unit-tested + recorded in the Scaling Milestones table; no public profile for regular listeners;
  no tokens/PII in public responses; no pay-to-play; no Spotify writes; `$0`; new code passes Snyk.

## Open Decisions & Assumptions

- **Open:** the exact gate thresholds (`X` users / `Y` active curators) — proposed defaults `Y = 25`,
  `X = 250`, set with concrete values in C1/C5 and tuned against real signups.
- **Assumed:** the persona lifecycle stays on the existing `curators` row via a widened `status` enum +
  `application_note` — no separate `curator_applications` table (decided in C1).
- **Assumed:** self-management is a new `app/api/me/curator` plane reusing `curator_picks` — no new pick store
  (decided in C3).
- **Assumed:** PRD numbering continues **29–33**; this registers as **Phase 13**; cycle labels C1–C5 scope to
  this initiative.
- **Assumed:** curator ranking influence is unchanged by this initiative — onboarding/self-management is
  graph + presentation; the `socialCircle` signal (PRD 26) and its guardrails (PRD 27) are untouched.
