# PRD 20: Cold-Start & Account Hand-off

Part of the [Deeper Personalization Initiative](../deeper-personalization-prd.md). Cycle **C3**. Satisfies desired outcome **3 (Cold-start & a graceful anonymous → account hand-off)**.

## Summary

Make personalization useful **before** sign-in and continuous **across** it. Today identity is `user:{id}` / `session:{id}`, and `getIdentityKeys` (`lib/discovery-memory.ts:481`) merges both **on read** only while a request carries both — so an anonymous session's accumulated signals **orphan** once the cookie rotates or the listener signs in on another device. This cycle (a) tunes cold-start so a near-empty history still produces a sensible, lightly-personalized board, and (b) adds a durable, idempotent **hand-off** that migrates session-keyed signals to the account at sign-in, so signing in feels like continuity rather than a reset.

## Implementation Status

**Planned.**

## Goals

- Strengthen **cold-start**: with few signals, blend gracefully toward public ranking plus a light, confidence-weighted affinity, avoiding overfitting to one or two interactions.
- Add a **durable hand-off**: when an anonymous session links to an account, migrate its `event_interaction_events` and `event_person_event_state` rows (and any derived state) to the user identity.
- Make the migration **idempotent and lossless** — run once per link, never double-count, never drop signals.
- Lose **nothing** the listener did while anonymous (including contributions/reactions already linkable via nullable `user_id`).

## Non-Goals

- No change to the affinity math itself (C2 owns the model; this cycle feeds it a complete, continuous signal history).
- No cross-device identity beyond the standard account link (no fingerprinting).
- No new consent surface beyond existing auth; the hand-off is a continuity convenience, not new data collection.

## Requirements

### Cold-start tuning (`lib/discovery.ts` / affinity layer)

- When a listener's signal history is thin, the per-dimension affinities (C2) must already degrade to weak, low-confidence contributions; verify and tune so the board stays useful (public Best Bets dominate) and doesn't swing on a single tap.
- Anonymous sessions accumulate and apply affinities exactly as signed-in listeners do (the model is identity-key agnostic) — confirm parity.

### Durable session → account hand-off (`lib/discovery-memory.ts` + auth wiring)

- At the session→account link moment (Auth.js sign-in / link event — wire in the auth config under `app/api/auth/*` / the auth options module; exact seam confirmed during the cycle), migrate rows keyed `session:{sessionId}` to `user:{userId}`:
  - Re-key (or copy) `event_interaction_events` and `event_person_event_state` from the session identity to the user identity, reconciling conflicts via the existing `on conflict (event_id, identity_key)` upsert semantics (keep the strongest/most-recent state, mirroring `mergeStateRows`/`latestIso`).
  - Provide a `migrateSessionSignalsToUser(sessionId, userId)` helper in `lib/discovery-memory.ts`, guarded by `isMissingRelationError` and safe to call repeatedly.
- **Idempotency:** a second invocation for the same pair is a no-op (no duplicated signals, no double-counted state).
- Preserve the interim merged-read behavior so signals are usable even before/without migration.

### Observability

- The hand-off must be visible in **Listener Trace**: a freshly signed-in listener shows their pre-sign-in signals attributed to the account.

## Dependencies

- **C2 (PRD 19):** the affinity model that consumes the now-continuous history.
- `lib/discovery-memory.ts`: `getIdentityKeys`, `getWriteIdentityKey`, `mergeStateRows`, `latestIso`, `isMissingRelationError`; tables `event_interaction_events`, `event_person_event_state`.
- Auth: Auth.js sign-in/link callback (the auth options module / `app/api/auth/*`), `lib/current-user.ts` (`requireUserId` / `getOptionalUserId`).
- Admin Phase 7: PRD 10 (Listener Trace).

## Risks

- **Double-counting on migration** — mitigated by idempotent re-keying with upsert conflict resolution and a unit test for repeated runs.
- **Wrong auth seam** — the exact sign-in/link hook must be confirmed; mitigated by an explicit investigation step at cycle start and keeping the merged read as a fallback.
- **Partial migration on failure** — mitigated by making the migration safe to re-run (idempotent) so a retry completes it; never block sign-in on it.
- **Privacy** — re-keying session rows to an account is a continuity action on the listener's own data; no new exposure, no PII in public responses.

## Acceptance Criteria

- An anonymous listener who builds up signals, then signs in, keeps those signals attributed to their account (visible in Listener Trace) after cookie rotation.
- The migration is idempotent: running it twice produces identical state with no duplicated signals.
- Cold-start ranking is sensible with little history (public-dominant, lightly personalized, not swingy).
- Sign-in never fails or blocks because of the hand-off; a missing table degrades to a no-op.
- New code passes Snyk; $0.

## Test Scenarios

- Build session signals → sign in → signals/state appear under the user identity; rotate the cookie → signals persist.
- Run `migrateSessionSignalsToUser` twice → no duplicates, identical final state.
- Conflicting session vs. existing account state for the same event → reconciled to the strongest/most-recent (matches `mergeStateRows`).
- New account with no prior session → no-op, normal cold-start ranking.
- Missing `event_interaction_events` / `event_person_event_state` relation → migration no-ops without error.
