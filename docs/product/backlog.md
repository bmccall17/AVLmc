# AVL Music Companion Backlog

Updated: July 2, 2026

## Urgent

* **Run the PRD 38 live cross-browser proof (Phase 15 — the only non-autonomous step).** The account loop
  is wired and live in code: signed-in OAuth linking is native Auth.js v5 behavior (verified in
  `next-auth@5.0.0-beta.31` source), and the `getUserByEmail` multi-email resolution is wired
  (`lib/auth-adapter.ts` → `auth.ts`). **Updated by Phase 17 (Jul 2, 2026):** matching-email
  collisions now **auto-link** onto the existing account (PRD 44 `allowDangerousEmailAccountLinking`
  — both doors verify email ownership; convergence proven adapter-level in `test:one-identity`
  against a throwaway Neon branch); the PRD 37 recovery remains only for the email-mismatch edge,
  and every Spotify entry point now runs through the PRD 43 chooser/gate. What remains is
  **live-browser proof**, which needs a human + live Spotify credentials: walk
  [`account-signin-linking-reliability-checklist.md`](account-signin-linking-reliability-checklist.md)
  across the supported browser/device matrix (all six legs — now entering via the chooser), and run
  `checkAccountIntegrity` (`lib/account-integrity.ts`) on the resulting rows after linking +
  reconnection. Fold in the Phase 17 additions: the tester-request → approve → invite → gated
  sign-in loop, and the fresh signed-out Spotify sign-in on an existing email (the July 2 brick,
  now expected to converge). `$0`, no Spotify writes, Snyk-clean.

* **File the Spotify Extension Request (Phase 17 C4 — owner action, ~10 minutes).** Everything it
  needs is live and prepared: `/privacy` is deployed and footer-linked, and
  [PRD 45](prds/prd-45-extended-quota-readiness.md) carries the dashboard checklist, ready-to-paste
  submission text, and the one-flag go-live runbook (`SPOTIFY_OPEN_ACCESS=true` on grant). Paste the
  submitted text + date into PRD 45 when sent. Also add `SPOTIFY_OPEN_ACCESS=false` to
  `.env.example` (env files were permission-protected from the build session).

  **Done (Jun 18, 2026):** the profile-menu "Email me a sign-in link" entry point for Spotify-first users
  (sends a magic link to an email already verified on their account → resolves back to it; no backend
  change). **Tier 2 (deferred):** linking a **brand-new/different** email while signed in needs a
  session-bound signed-token + confirm route (the email-provider path doesn't auto-link to the session like
  OAuth does), plus hardening `findUserIdByEmail` to `verified`-only — security-sensitive, lower urgency.

* _Otherwise none open._ The analytics/WAU‑MAU dependency below is resolved. Active focus is the design
  audit cleanup, the Phase 15 follow-up above, and the Personalized Discovery follow-ups tracked in
  [`personalized-discovery-backlog.md`](personalized-discovery-backlog.md).

## Planned Next / Up Next

- **Phase 16 C3 remainder — local-DB degradation + readability smoke test.** The June 25 audit's readability
  and integrity blockers shipped (Phase 16 C1–C2, see Done); two follow-ups remain, tracked by
  [PRD 41](prds/prd-41-design-system-codification.md): (1) **decide the missing-local-`DATABASE_URL`
  behavior** — either require it before `npm run dev` with a clear message, or degrade DB reads to seed/empty
  where the product already claims resilience (`lib/events.ts` already seeds, but the read throws before the
  fallback; extend the same pattern to `listCurators` / `listContributions`); and (2) **add a Playwright
  readability smoke test** over the audit route table (render checks, no horizontal overflow, error/404/auth
  legibility, a dark-shell-aware DOM contrast pass). Do (1) first so the audited routes render deterministically
  under the test. The Design Spec rewrite (the third C3 piece) is already shipped. `$0`, no new deps.

- **Freshness & drift-awareness for Architecture implementation notes.** The per-node
  `implementationNotes` (and the registry's `description`s) are **hand-authored free-text**: they
  ride the `/ship` regen + drift guard so the generated map / JSON export / admin graph never fall
  out of sync with `lib/system-registry.ts`, **but nothing validates the note *content* against the
  code it describes.** When the backing SQL / param mapping / runtime behavior changes, a note can
  silently go stale and there's no signal in the admin panel that it's outdated.
  **Why it matters:** these notes are read by both developers *and* AI agents as ground-truth for
  low-level behavior (SQL fallbacks, `$n` param mappings, driver gotchas) — a *stale* note is worse
  than none, because it actively misleads debugging and agent reasoning. As the codebase evolves,
  drift is inevitable without a freshness mechanism. Desired outcomes:
  1. **Per-note authored/reviewed date.** Add an optional `reviewedAt` (date) to `ImplementationNote`
     in `lib/system-registry.ts` so each note carries when it was last verified against the code.
  2. **Staleness indicators in the admin Architecture panel.** Surface "reviewed N days/months ago"
     on the tooltip + `NodeDetail`, and flag a note **amber/stale** when the backing file changed
     after the note's `reviewedAt` — compute via the backing file's last commit date
     (`git log -1 --format=%cs <sourceOfTruth>`, build-time/server-side; tables compare against
     `db/schema.sql`) vs. `reviewedAt`. A node-level "⚠ may be outdated" badge on the graph.
  3. **An exact "what to ask for" refresh prompt.** A per-node copyable prompt/checklist (e.g.
     *"Re-verify the implementation notes for node `svc-discovery-memory` against
     `lib/discovery-memory.ts`; confirm the window param, GREATEST hand-off, and 42P01 tolerance are
     still accurate, then update `reviewedAt`."*) so the user can hand a precise ask to an agent — plus
     an admin "stale notes" roll-up listing every node whose notes need re-review, newest-drift first.
  4. *(Stretch)* tie a note to a **code anchor** (function name / symbol) so true content-drift can be
     guarded by a test, not just inferred from file mtime.
  Reuses the existing registry/graph machinery; `$0`, no new deps, security-at-inception. *(Reported
  Jun 24, 2026, as the deliberate follow-up to the free-text trade-off in the implementation-notes ship.)*
- **Nested Comments on Contributions**: Allow users to comment specifically on a listed song or note.
- **Permanent Curator Fixtures**: Songs added by a curator should become permanent fixtures on their profile, so they never roll off even if the event is in the past.

## Scheduled

* **Decommission Aiven — unhook completely (trigger: on/after June 23, 2026, once Neon has run stable ≈1 week).** Production migrated Aiven → Neon on June 16, 2026 (see [Deployment and Auth Investigation](deployment-auth-investigation.md)); Aiven is being kept **only** as a rollback safety net for one week. Once Neon is confirmed healthy under real traffic, fully retire Aiven:
  * Confirm Neon stability: no `53300`/connection errors, funnel writes landing, sign-in working, admin Health probe green for the week.
  * Remove any lingering Aiven connection string from Vercel (all envs: Production/Preview/Development) and from any local `.env`.
  * Delete / power down the Aiven PostgreSQL service so it can't be accidentally re-pointed.
  * Rotate or invalidate the old Aiven credentials.
  * Confirm no code/docs still reference Aiven as live (only the intentional historical notes in ADR 0001 and launch PRDs 04/05 should remain).
  * Take a final Aiven `pg_dump` to cold storage before deleting, just in case.

## Parked

* **YouTube (Google) sign-in & account-linking provider** — Parked for a future sprint, after Phase 15 (Spotify) account linking ships. Phase 15's [`account-signin-linking-prd.md`](account-signin-linking-prd.md) builds the linking + multi-email model **generically**: the `googleYouTube` flag already exists (`lib/auth-flags.ts`, off) and `user_emails.source = 'google_youtube'` is a reserved value. Remaining work: register a Google/YouTube provider in `auth.ts`, wire its read-only scopes + a `music_connections` provider, surface "Connect YouTube / add this email" through the PRD 35 `me/account-links` surface, and add it to the PRD 38 cross-browser test. No new `users` row — the returned email associates to the existing account like Spotify's. `$0`, no writes, Snyk-clean.

* **Apple Music sign-in & account-linking provider** — Parked for a future sprint, after Phase 15 (Spotify) account linking ships. Same shape as the YouTube stem: the `appleMusic` flag exists (`lib/auth-flags.ts`, off) and `user_emails.source = 'apple_music'` is reserved. Remaining work: register an Apple provider in `auth.ts` (Sign in with Apple / MusicKit), wire read-only access + a `music_connections` provider, expose linking through the PRD 35 `me/account-links` surface, and extend the PRD 38 test. Associates the Apple-returned email to the existing account; no duplicate identity. `$0`, no writes, Snyk-clean. *(Flag any Apple Developer Program cost before starting — must stay within `$0` or be explicitly approved.)*

* **Design-spec alignment pass for the new Phase 15 / account surfaces.** Audit the surfaces added across
  Phase 15 + the onboarding/sign-in work against [`docs/design/AVLmc-Design-Spec.md`](../design/AVLmc-Design-Spec.md)
  (dark monochrome, zinc surfaces/borders, glassmorphism, uppercase-tracked metadata, orange/rose accents
  reserved for interaction): the `app/auth/error` recovery page + `components/AuthRecovery.tsx`, the
  `components/SpotifyAccessRequest.tsx` + admin `SpotifyAccessSection`, and the listener-profile email
  sign-in / Spotify-access additions in `components/ListenerProfileButton.tsx`. Bring the ad-hoc `.form-message`
  / `.listener-spotify-optional` styling and the recovery page's inline border colors into line with the spec.
  `$0`, no behavior change. *(Reported Jun 18, 2026.)*

* **Admin viewer for listener feedback.** The 404 detour (`app/not-found.tsx`) + `POST /api/feedback`
  now persist feedback to the `feedback` table (additive; `db-feedback` node), but there's **no admin
  surface to read it yet**. Add a simple admin-cookie-gated read (`app/api/admin/feedback` + a
  `components/admin/*Section.tsx` panel, or a column in an existing tab) listing recent notes (message,
  optional email, path, when). Reuses the admin-review pattern. *(Shipped Jun 18, 2026: the 404 detour +
  capture; the viewer is the fast-follow.)*

* **Vercel Caching for OG Image Generation**: Add Next.js route segment caching (`export const revalidate = 3600;`) to the dynamic per-event `app/event/[id]/opengraph-image.tsx` and `twitter-image.tsx`. This will cache the expensive Satori/WebAssembly image generation on Vercel's CDN, preventing runaway compute costs (GB-Hours) if an event link goes viral and is scraped thousands of times. Parked while WAU < 10.

## Done

* **Open Spotify Access epic (Phase 17, PRDs 42–45)** — Shipped (July 2, 2026), four cycles in one
  sprint; see [`spotify-access-prd.md`](spotify-access-prd.md) for the epic record. Closes the July 2
  production audit's five gaps: anonymous tester capture with owner-notification + invite loop
  (`tester_requests`, `/spotify-access`, admin queue with cross-store seat counter — PRD 42); the
  pre-redirect chooser/gate so nobody lands on Spotify's dev-mode 403, with `signIn("spotify")`
  confined to one guard-tested module across 9 migrated call sites and a custom `/auth/signin`
  replacing the NextAuth default (PRD 43); one-identity auto-link with convergence proven in real SQL
  and the "never merge" stance retired (PRD 44); `/privacy` + footer, submission text, and the
  `SPOTIFY_OPEN_ACCESS` go-live runbook (PRD 45). Remaining owner actions tracked in Urgent above.

* **Event-card FIRE effect + layout redesign — and the Card FX Lab admin tuning tool** — Shipped
  (June 30, 2026), standalone UI (no PRD/admin cycle). Reworks how the discovery feed signals FIRE and
  tightens the card's information layout, dialed in against a live admin prototype before going to production.
  * **Card FX Lab** (`components/admin/CardFxLabSection.tsx`, new tab in `components/AdminPortal.tsx`): a
    self-contained admin prototyping surface — a faithful mock of `DiscoveryEventCard` built from the real
    `.sandbox-*` classes, with per-element visibility toggles, a **Resting/Hover** state switch, live
    action-button pressed-states + the production hover tooltips, tunable fire controls (glow
    intensity/color/rise-speed, SVG turbulence, cursor-drag hotspot, embers), a copy-ready CSS export, a
    **displacement detector** that flags elements hidden behind others, and an **archived snapshot** of the
    previous card design at the bottom for reference.
  * **Live event card** (`components/EventBoard.tsx`): the FIRE state now reads as the whole card being on
    fire. **Embers** rise off any card with community FIRE traction (`counts.fire > 0`, capped at 14) —
    illuminating events getting heat *before* this user fires; the **upward-rising perimeter glow + SVG
    turbulence + cursor-drag hotspot** ignite only once *this* user fires (`state.fire`). Layout: social
    pulse moved to the **top-right above %match** (songs-only), **Top 30 below %match**, genre tag alone on
    the left; the lower-signal badges (intent sources, shared songs, from-your-circle, curated-by) are hidden
    behind a `SHOW_SECONDARY_CARD_BADGES` flag (one flip to restore). Effect CSS generalized to shared
    `.sandbox-event-card.is-fired` / `.fire-fx-*` (used by both lab and live), one shared
    `<filter id="cardFireTurb">`, `prefers-reduced-motion`-aware.
  * `typecheck` / `lint` / `test:registry` (7) / `test:discovery` (38) green; new code (EventBoard,
    CardFxLabSection, AdminPortal) Snyk-clean (the one Medium DOM-XSS is the pre-existing **tracked**
    `CommunityPanel.tsx` finding, untouched here); `$0`, no new deps. *(Admin UI changed — a
    `docs/product/snapshots/` refresh is the manual follow-up.)*

* **Dark-shell readability + functional blockers from the June 25 design audit** — Shipped (June 25, 2026) as
  **Phase 16 C1–C2** ([Design-System Readability & Integrity Repair Epic](design-system-readability-prd.md),
  [PRD 39](prds/prd-39-dark-route-shell-readability.md) + [PRD 40](prds/prd-40-legible-failure-states-and-integrity.md)).
  Root cause: a split design system — light-era `:root` tokens (`--ink`/`--muted`/`--panel`) drove the generic
  `.shell` while the global first viewport paints dark, so newer pages rendered near-black text on dark.
  **Token-first fix:** one canonical dark route-shell context in `app/globals.css` re-declares the tokens as
  dark **on the wrapper** for `.curators-directory-shell` / `.admin-curators-shell` / `.auth-recovery-shell` /
  `.not-found-shell` / `.error-shell` (+ a fixed full-bleed `#0A0A0A` `::before`), so every descendant reading
  `var(--ink/--muted/--panel/--line/--border/--surface)` — including the existing `var(--surface,#fff)` /
  `var(--muted,#a1a1aa)` fallbacks — flips to dark with no per-element edits. **Functional blockers cleared:**
  `app/error.tsx` got the `.error-shell` class; auth-recovery mobile CTA now wraps full-width under `460px`;
  the `/icon.png` 500 was resolved (removed the duplicate `app/icon.png`, kept `public/icon.png` canonical,
  added `metadata.icons` in `app/layout.tsx`); `CuratorAdminPanel`/`SpotifyAccessSection` now surface non-OK /
  network failures as a retryable `.admin-curators-error` banner instead of silently-empty queues; the four
  promote-curator inputs gained `aria-label`s. `typecheck` / `lint` / `test:registry` (7) green; changed admin
  components Snyk-clean; `$0`, no new deps. **Re-audit follow-up (June 25, 2026)** closed the residual gaps a
  Playwright re-audit found: tall dark pages no longer leak the light gradient band (`html:has(<dark shell>)`
  paints the full document `#0a0a0a`); `.ghost-control` CTAs are re-skinned dark (were white-on-pale ~1:1);
  the admin error banner + admin buttons now clear AA and match the dark system; the teal eyebrow + admin-login
  back link were brightened to AA; and the future-dated `June 26` doc stamps were corrected to `June 25`.
  **Remainder (Phase 16 C3, Planned Next):** the local-`DATABASE_URL` degradation decision + a Playwright
  readability smoke test (the Design Spec rewrite is already shipped).

* **"Recommend a curator" — replaced the `mailto:` with an in-app intake** — Shipped (June 24, 2026), as
  part of a five-item curator-surface polish sprint. **Decisions:** signed-in only (`requireUserId()`-gated)
  and admin notified **in-panel queue + Resend**. **Delivered:** a private `curator_recommendations` table
  (`db/schema.sql`, idempotent, applied to prod Neon); pure validation `lib/curator-recommendations-core.ts`
  (+ `tests/curator-recommendations.test.ts`) and the `server-only` service `lib/curator-recommendations.ts`
  (submit / admin-list / set-status, 42P01-tolerant); `POST /api/me/curator-recommendation` (mirrors the
  curator-application route; best-effort `sendAdminNotificationEmail` via Resend, wrapped so it can never
  fail the submit); the `/curators/recommend` page + `components/CuratorRecommendForm.tsx`; and a
  Reviewed/Dismiss queue in `components/admin/CuratorAdminPanel.tsx` (extended `app/api/admin/curators`).
  Registered in the System Registry (`db-curator-recommendations`, `api-me-curator-recommendation` + edges,
  pending-count). **Shipped alongside (same sprint, enhancing PRDs 25/30/34):** the homepage curator CTA
  now links `/curators/apply` + `/curators/recommend` (no more `mailto:`, no external-link icon on an in-app
  route); curator signup is **email-first** (shared `components/EmailSignInPanel.tsx`, Spotify optional);
  directory cards now carry a **taste signature** (top genres/venues + next/latest pick); and a signed-in
  active curator's **Fire/Going auto-adds a visible pick** (toast "Added to your curator picks"; un-react
  hides it). `typecheck` / `lint` / `test:registry` (7) / `test:curators` (12) / `test:curator-recommendations`
  (5) / `next build` green; new code Snyk-clean (one stored-XSS in the admin nominee link caught + fixed by
  rendering it inert); `$0`. *(Reported Jun 18, 2026.)*

* **`db/schema.sql` apply runbook (prevent schema drift)** — Shipped (June 24, 2026). The systemic fix
  for the Jun 18 incidents (prod silently missing tables → "unavailable" 500s; two manual applies in one
  day). **Scripted apply:** `npm run db:apply` (`scripts/apply-schema.ts`, tsx + `pg` directly, not the
  `server-only` `lib/db`) runs the idempotent `db/schema.sql` against the Neon **direct** endpoint (strips
  the `-pooler` host per the schema header), prefers `MIGRATION_DATABASE_URL` else `DATABASE_URL`, prints
  `→ N public tables, 0 errors`, and exits non-zero on failure (host only is printed — never the
  connection string). **Runbook:** a `## Schema apply runbook` section in
  [`deployment-auth-investigation.md`](deployment-auth-investigation.md) — run `vercel env pull` then
  `npm run db:apply` after any schema-touching release; idempotency, direct-endpoint, verification (table
  count vs. registry datastore nodes), and incident history documented. **Defensive (the secondary half):**
  `applyForCurator` + `submitMySpotifyAccessRequest` now catch `42P01`/`42703` on their write path and
  throw a shared `SchemaNotProvisionedError` (`lib/schema-errors.ts`), which the two `app/api/me/*` routes
  map to **503 + "… isn't set up yet — run `npm run db:apply`"** instead of an opaque 500.
  **Idempotency proven** against a throwaway Neon branch (applied twice → `24 public tables, 0 errors`
  both runs). `typecheck` / `lint` / `test:registry` (7) green; new/edited files
  Snyk-clean; `$0`. No GitHub CI / Vercel build-hook (deliberately a documented manual step that fits the
  local-`main` workflow). *(Running `db:apply` against prod stays the operator's release step.)*

* **Moderation tab UX overhaul** — Shipped (June 24, 2026). The admin Moderation tab
  (`components/AdminModeration.tsx`, inside `AdminPortal`; data via `app/admin/page.tsx`) was rebuilt
  around all four complaints, **with no schema/type/API change** (`ContributionStatus`,
  `setContributionStatus`, and `POST /api/admin/contributions` already supported it). **Status model:**
  diagnosed that new contributions insert `'visible'` (no pre-moderation) and the public board only
  renders `status = 'visible'`, so `hidden`/`pending` were both just invisible-to-public and `pending`
  was never auto-set — `pending` is now an explicit **"Needs review"** flag (product-owner call:
  visible-by-default kept, no new friction). **Actions:** the three-equal **Hide/Unhide/Pending** toggle
  became a clear primary + secondary per state (visible → Hide / Flag for review; hidden → Restore /
  Flag for review; needs-review → Restore / Hide). **Filtering:** the `/admin?status=` full-reload tabs
  (which also bounced you off the Moderation tab) became **client-side filter buttons with live
  per-status counts** — `app/admin/page.tsx` now loads the full set (`listContributions()`) and
  `currentStatus` seeds the initial filter; actions update in place so items move between tabs. **Rows:**
  the tall `<h2>` two-column layout is now a dense, scannable row — colored status chip, event-title
  **link to `/event/[id]`**, contributor + a **curator @handle** provenance badge, **relative timestamp**
  (absolute on hover), tidy "link ↗" for song URLs, and clamp/expand for long notes
  (`app/globals.css`). The public-board invariant is intact (hide still drops a contribution from public).
  `typecheck` / `lint` / `test:registry` (7) green; changed files Snyk-clean; `$0`. *(Live `/admin`
  click-through + a `docs/product/snapshots/` refresh remain the manual follow-up.)*

* **Admin │ Architecture — implementation-detail hover tooltips** — Shipped (June 24, 2026).
  Enhancement to the PRD 06 / C1 architecture surface (which had only a macro service→table view):
  the graph now exposes per-node micro-detail on hover. An additive, optional `implementationNotes`
  field on `RegistryNode` (`lib/system-registry.ts`) — typed by `ImplementationNoteKind`
  (`sql_fallback` / `param_mapping` / `runtime_gotcha` / `note`, with `IMPLEMENTATION_NOTE_KIND_LABELS`)
  — drives a styled HTML tooltip overlay (`ImplementationTooltip` in
  `components/admin/ArchitectureSection.tsx`, design-spec zinc/glass in `app/globals.css`) anchored to
  the hovered/focused node (flips below when it would overflow), after a **1.1s hover-intent delay**
  (`HOVER_INTENT_MS`, tunable) so it doesn't flicker while sweeping the graph (keyboard focus shows
  immediately), with a `ⓘ` affordance on nodes that carry notes; the same notes also render in the click
  `NodeDetail` (covers List view, touch, keyboard). Because the field lives on the one drift-guarded
  registry, the notes flow automatically into the JSON export (`GET /api/admin/system-map`) and the
  generated markdown (`docs/product/system-map.generated.md`, regenerated) agents read — one source of
  truth. **All 70 registry nodes** now carry **code-verified** notes (harvested from the backing files —
  e.g. `db-events` window-read param mapping; `db-music-connections` `null::timestamptz` / `db-music-profile-items`
  `'{}'::text[]` missing-column fallbacks; `svc-discovery-memory` `make_interval(days => $2::int)` + GREATEST
  hand-off; `svc-curators` no-FK snapshot; the `42P01/42703` brownfield-tolerance pattern across services;
  `ui-community-panel` flags the tracked Snyk DOM-XSS). Drift guard extended with a note-kind invariant (`test:registry`, 7).
  `typecheck` / `test:registry` / `lint` green; new code Snyk-clean; `$0`; no change to the public product.
  *(This consolidates the duplicate "Admin/Architecture Hover Tooltips" (Planned Next) and "Admin
  Architecture Graph — Implementation Tooltips" (Parked) entries.)*

* **404 "detour" page + listener feedback capture** — Shipped (June 18, 2026). A broken link is treated as
  a missed connection, not a dead end: `app/not-found.tsx` apologizes, shows three shows happening soon
  (next 24h, else soonest upcoming, via `getUpcomingEvents`; resilient if events can't load), explains in
  plain language how the board personalizes (with a tune-it link), offers a feedback form
  (`components/FeedbackForm.tsx` → public `POST /api/feedback`) that returns to the board on send, a
  "Skip & go home", and an "explore & recommend curators" link. Feedback persists to an additive `feedback`
  table via `lib/feedback(-core).ts` (submit is `42P01`-tolerant so the form never errors before
  provisioning); pure validation unit-tested (`test:feedback`, 5 cases); registered (`db-feedback`,
  `api-feedback`); cross-browser e2e (`e2e/not-found.spec.ts`, Chromium + Firefox). Admin feedback viewer is
  the parked fast-follow. `$0`, anonymous-first, Snyk-clean.

* **Transactional / magic-link email design pass** — Shipped (June 18, 2026). The Auth.js Resend magic-link
  email is now a branded dark-mode template (`lib/auth-email.ts`: `renderMagicLinkEmail` →
  `{ subject, html, text }` with an HTML-escaped, deliverability-safe inline-styled body + a plain-text
  fallback; `sendMagicLinkEmail` posts to Resend), wired via a `sendVerificationRequest` on the `Resend`
  provider in `auth.ts`, aligned to [`docs/design/AVLmc-Design-Spec.md`](../design/AVLmc-Design-Spec.md).
  Unit-tested (`test:auth-email`, 4 cases). `$0` (Resend free tier). *(The broader Phase 15 surfaces design
  pass — recovery page, Spotify-access UI, profile additions — remains parked above.)*

* **Support link — "buy me a coffee" (humble)** — Shipped (June 17, 2026). A quiet, on-brand support ask while the service is pre-revenue. Delivered:
  * `components/SupportButton.tsx` — a gold `Coffee` (lucide) icon in the topbar linking to `https://buymeacoffee.com/bmccall17` (new tab), with an accessible hover/focus tooltip (`aria-label`, `role="tooltip"`, keyboard-focusable).
  * `app/page.tsx` — `<SupportButton />` placed in `sandbox-topbar-actions`, after `ListenerProfileButton`.
  * `app/globals.css` — `.sandbox-support` button + `.sandbox-support-tooltip`, modeled on the existing `.sandbox-action-tooltip` pattern and tinted with `--gold`; right-aligned and viewport-capped so it never overflows the bar on mobile.
  * Tooltip copy (intentionally lowercase/humble): "a project fueled by a love for music… and coffee! if it's useful and you want to see it keep growing, consider buying me a coffee."
  * No PRD/admin cycle — standalone UI. Typecheck, `test:registry`, and Snyk code scan all green.

* **Analytics & Tracking for WAU/MAU** — Resolved (June 2026). **Umami Cloud** is the chosen lightweight, low-cookie tracker; the script is wired in `app/layout.tsx` (gated on `NEXT_PUBLIC_UMAMI_WEBSITE_ID`). The Admin Portal's **Analytics** tab (Cycle C6 / [PRD 11](prds/prd-11-product-analytics-umami.md)) reads Umami back **server-side** — unique visitors (the WAU/MAU proxy) over 24h/7d/30d, top pages, and referrers — joined with a first-party event funnel and conversions, plus a **free-tier scaling-milestone indicator** that flags when usage nears the Umami ceiling (the trigger for un-parking items like the OG caching above and Vercel compute protections).
  * On-site tracking already collects without extra config; to read traffic *into* the portal, set the server-only `UMAMI_API_KEY` (and optional `UMAMI_API_URL`). Until it is set, the Analytics tab shows a clear "not configured" notice and the first-party funnel/conversions still render.
  * Cross-reference: the [master roadmap](master-roadmap.md) Scaling Milestones still own the $0 ceilings; this item only delivered the *visibility* needed to see them coming.
