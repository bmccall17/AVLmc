# PRD 11: Product Analytics & Usage Visibility (Umami)

Part of the [Admin Portal Initiative](../admin-portal-prd.md). Cycle **C6**. Satisfies desired outcome **7 (Product Analytics and Usage Visibility)**.

## Summary

Bring Umami analytics into the portal as a clear operational view of how people actually use AVL Music Companion — traffic, page engagement, referral sources, event interactions, sign-in behavior, and conversion actions — so product decisions rest on real usage instead of guesswork or a separate dashboard. Today Umami only loads a tracking script; none of its data is read back into the admin. This cycle joins Umami's web analytics with the app's own behavioral signals for a single usage picture.

## Implementation Status

**Shipped.** Delivered:

- `lib/admin/analytics.ts` — `loadAnalytics(range)` reads Umami stats server-side via the Umami Cloud API (`x-umami-api-key`, server-only `UMAMI_API_KEY` / optional `UMAMI_API_URL`, keyed to `NEXT_PUBLIC_UMAMI_WEBSITE_ID`): traffic (visitors/sessions/pageviews + previous-period trend + bounce), top pages, and referrers. Defensive parsing tolerates response-shape differences; everything is time-boxed and cached (60s).
- First-party half (always available from our DB, even with Umami off): an event funnel joining Umami detail pageviews with exact `event_interaction_events` (detail_open / avlgo_click / fire / planning), conversions (contributions / reactions / intents) over the range, and monthly first-party event volume vs. the Umami free-tier ceiling (scaling-milestone indicator).
- `components/admin/AnalyticsSection.tsx` — a new **Analytics** tab with a 24h / 7d / 30d selector (client-fetches `GET /api/admin/analytics?range=`), traffic cards, top pages / referrers, the funnel, conversions, and the scaling indicator. With Umami unconfigured/unreachable it shows a clear notice and the first-party data still renders.
- Security/$0: the API key is server-only and never reaches the client; reads are cached; the cycle stays on the free tier. The Umami registry node now documents the read-back path.

Brownfield baseline (now extended): `app/layout.tsx` only injected the tracking script; there was no read path or in-portal surface. **API-access note:** if a given Umami Cloud tier withholds API access, the section degrades to the documented "configured but unavailable" state and first-party analytics continue — satisfying the cycle's graceful-fallback requirement.

## Goals

- Present core Umami metrics in the portal: visitors/sessions, pageviews, top pages, referral sources, and trend over a selectable range.
- Surface engagement and conversion signals: event-detail engagement, AVLgo outbound clicks, sign-in behavior, and contribution/reaction conversions.
- Join Umami's page-level view with the app's first-party `event_interaction_events` so the operator sees both "how they arrived/browsed" and "what they did with events."
- Respect the existing $0 posture and the roadmap's Umami scaling milestone; degrade gracefully if API access is constrained.

## Non-Goals

- No replacement of Umami or addition of a second analytics vendor.
- No heavy cookies or additional client tracking beyond what Umami already does (the roadmap explicitly favors the lightweight, low-cookie approach).
- No building a general BI warehouse; this is a focused operational view.
- No exposing the Umami API key or any secret to the client.

## Requirements

### Umami Data Access (`lib/admin/analytics.ts`)

- Read Umami stats server-side via the Umami Cloud API (website stats, pageviews, metrics/referrers) using a server-only credential (proposed `UMAMI_API_KEY` / `UMAMI_API_URL`, names only — never shipped to the client), keyed to the existing `NEXT_PUBLIC_UMAMI_WEBSITE_ID`.
- Verify at the start of this cycle that the current Umami Cloud tier permits API/share access at $0; if it does not, fall back to the documented read-only **shared-stats** path and note the limitation. Either way the data is fetched server-side and cached briefly to respect rate/usage limits.
- Tolerate Umami being unconfigured or unreachable: the section shows a clear "analytics not configured / unavailable" state rather than failing the admin page.

### Analytics Surface (`components/admin/AnalyticsSection.tsx`)

Present, over a selectable range (e.g., 24h / 7d / 30d):

- **Traffic:** unique visitors, sessions, pageviews, and trend (the visitor count is the WAU/MAU proxy already referenced in the roadmap).
- **Page engagement:** top pages, average time/engagement where Umami provides it, bounce/entry where available.
- **Referral sources:** top referrers / channels.
- **Event interactions:** event-detail views and AVLgo outbound clicks (from Umami events and/or `event_interaction_events`).
- **Sign-in behavior:** sign-in starts/returns inferred from auth-route hits and signed-in session presence.
- **Conversions:** contribution submissions, reactions, planning/fire, and ticket-intent/AVLgo clicks as the product's "conversion" actions.

### First-Party Join

- Combine Umami page-level metrics with first-party `event_interaction_events` aggregates so, for example, "event detail pageviews (Umami)" sits next to "detail_open / avlgo_click / fire / planning (first-party)" for a coherent funnel from arrival → browse → engage → convert.
- Reuse the existing interaction aggregation (`getInteractionStats`) and extend it where the funnel needs it, keeping queries inside sensible windows.

### Scaling-Milestone Awareness

- Surface the current monthly event volume against the roadmap's Umami free-tier ceiling so the operator can see when the parked "self-host / upgrade Umami" milestone is approaching.

## Dependencies

- [PRD 06](prd-06-admin-portal-platform-and-architecture.md) admin service-layer scaffolding (analytics is a registry node/integration) and [PRD 07](prd-07-system-health-and-connection-visibility.md) Umami health check (soft).
- Existing `NEXT_PUBLIC_UMAMI_WEBSITE_ID` wiring in `app/layout.tsx`; existing `event_interaction_events` and `getInteractionStats`.
- Umami Cloud API/share access and a server-only credential.

## Risks

- **Umami free-tier API limits or no API on the current plan** — mitigated by verifying access first, caching server-side reads, and falling back to the shared-stats path.
- **Secret exposure** — mitigated by keeping the API key server-only; never reaching the client; names-only in any config display (consistent with the rest of the portal).
- **Metric mismatch** between Umami (page-level, cookieless sampling) and first-party events (exact) — mitigated by labeling each source clearly and not implying they must reconcile exactly.
- **$0 ceiling** — heavy polling could pressure limits; mitigated by short-TTL caching and range-scoped queries.

## Acceptance Criteria

- The portal shows visitors/sessions/pageviews with a trend over a selectable range, sourced from Umami server-side.
- Top pages and referral sources are visible.
- Event interactions, sign-in behavior, and conversion actions are surfaced, with a funnel that joins Umami page data and first-party `event_interaction_events`.
- Current monthly event volume is shown against the Umami free-tier scaling milestone.
- With Umami unconfigured or unreachable, the section degrades gracefully and the rest of the portal is unaffected.
- The Umami API key/credential is never exposed to the client; new code passes a Snyk scan; the cycle runs at $0 on the current tier (or documents the constrained fallback).

## Test Scenarios

- With Umami configured, open Analytics → visitors/pageviews/top pages/referrers render for 7d and update when switching to 30d.
- The event funnel shows Umami detail pageviews beside first-party detail_open/avlgo_click/fire/planning counts.
- Conversion row reflects recent contributions/reactions/intents.
- Unset the Umami credential → the section shows "analytics not configured" and the admin page still loads fully.
- Simulate an API error/timeout → cached or empty state shown, no page crash, no secret leaked.
- Monthly event volume nearing the free-tier ceiling → the scaling-milestone indicator flags it.
