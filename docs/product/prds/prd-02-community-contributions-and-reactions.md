# PRD 02: Community Contributions and Reactions

## Summary

Add low-friction community context to event pages: song recommendations, short notes, "thinking of going" signals, and fire/excitement reactions.

This phase turns the event board into a discovery layer.

## Implementation Status

Built in `components/CommunityPanel.tsx`, `/api/community/contributions`, `/api/community/reactions`, and `lib/community.ts`. Public pages show only visible contributions and homepage cards show counts.

**Toggle fix (July 3, 2026):** Fire and Going are now true toggles end-to-end — previously un-firing/un-going left the reaction row and count in place (`on conflict do nothing` with no delete path), so a second click returned `fire: true` and an unchanged count. `lib/community.ts` `toggleReaction` now takes an explicit `on` direction (off deletes the caller's fire reaction, count −1) and a new `removeEventIntent` deletes the Going intent row; deletes match by session and, for signed-in users, any stray rows under their user id. Button clicks drive this through `POST /api/discovery/event-action` (state written first, counts derived from post-toggle state); external intent sources (spotify / ticket-click) keep their set-once semantics, and the legacy `/api/community/reactions` route (no live callers) keeps its old set-only behavior. No schema changes.

## Goals

- Let visitors contribute without creating an account.
- Surface community activity on homepage cards.
- Preserve contributions across AVLgo event refreshes.
- Keep spam controls basic but present.
- Keep the phase compatible with `$0` hosting and storage.

## Non-Goals

- No full profiles.
- No private messaging.
- No required email collection.
- No voice memos in this phase.
- No paid anti-spam service.

## Requirements

### Song Recommendations

Visitors can submit:

- Song title.
- Artist name, prefilled from the event when possible.
- Music link, accepting Spotify, YouTube, Bandcamp, Apple Music, or a plain URL.
- Optional short note.
- Optional display name.

### Text Notes

Visitors can submit:

- Short body text.
- Optional display name.

Text notes should be suitable for quick local context, such as prior show experience, genre comparison, or plans to attend.

### Reactions

Each event supports:

- "Thinking of going" reaction.
- Fire/excitement reaction.

Rules:

- One reaction per server-issued anonymous session per event per reaction type.
- Counts display on event detail pages.
- Counts display on homepage cards.
- Reactions do not require an account.

### Contribution Display

Event detail pages must show:

- Song recommendations.
- Text notes.
- Reaction counts.
- Created time or relative age when practical.
- Display name when provided.

Homepage cards must show:

- Song recommendation count.
- Text note count.
- Going count.
- Fire count.

### Basic Spam Controls

The contribution form must include:

- Honeypot field.
- Basic rate limit.
- Maximum length limits.
- Validation for required fields.

## Minimum Data

Contribution:

- ID.
- Event ID.
- Type: `song` or `comment`.
- Display name.
- Body text.
- Song title.
- Song URL.
- Created timestamp.
- Status: `visible`, `hidden`, or `pending`.

Reaction:

- ID.
- Event ID.
- Type: `going` or `fire`.
- Session ID.
- Created timestamp.

## Dependencies

- PRD 01 event IDs and detail pages.
- Phase 0 storage/database choice.
- PRD 03 moderation should follow soon after this phase.

## Risks

- Anonymous submissions may create spam.
- URL validation may reject legitimate music links if too strict.
- Anonymous session-based reactions are imperfect but acceptable for MVP.

## Acceptance Criteria

- Visitors can submit song recommendations.
- Visitors can submit text notes.
- Visitors can mark "thinking of going".
- Visitors can add fire/excitement.
- Homepage cards show counts for songs, notes, going, and fire.
- Detail pages show submitted content and reaction counts.
- Contributions persist after AVLgo data refreshes.
- Anonymous use works without login.
- The implementation can run at `$0`.

## Test Scenarios

- Submit a valid song recommendation.
- Submit a valid text note.
- Submit reaction once and confirm duplicate click does not double count.
- Refresh AVLgo event data and confirm contributions remain attached.
- Submit spam-like honeypot data and confirm it is blocked.
- Verify mobile contribution forms are usable.
