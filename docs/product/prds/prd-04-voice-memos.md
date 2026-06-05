# PRD 04: Voice Memos

## Summary

Add short voice memo contributions so visitors can share quick spoken context about an artist or show.

This phase is intentionally later because audio storage, playback, abuse handling, and moderation increase complexity.

## Implementation Status

Deferred for the first production release. The Vercel/Aiven launch excludes voice memo upload, local file storage, and playback. Keep this PRD as the future storage-backed audio plan.

## Goals

- Let visitors add short audio context to an event.
- Keep voice memos capped at 60 seconds.
- Preserve anonymous, low-friction participation.
- Keep storage and playback within the `$0` constraint.

## Non-Goals

- No transcription in this phase.
- No AI summaries.
- No audio editing.
- No podcast-style feeds.
- No paid storage or transcription service.

## Requirements

### Voice Memo Submission

Visitors can:

- Record a voice memo in the browser when supported.
- Upload an audio file as fallback.
- Add an optional display name.

Limits:

- 60 seconds maximum.
- File size cap determined by the selected `$0` storage provider.
- Accepted audio formats determined by browser and storage support.

### Voice Memo Display

Event detail pages must show:

- Playable audio memo.
- Display name when provided.
- Created timestamp or relative age when practical.

### Moderation

Admin moderation must support:

- Listing voice memos.
- Hiding voice memos.
- Excluding hidden voice memos from public pages and counts.

### Launch Gate

Do not implement this phase until Phase 0 confirms a practical `$0` storage path.

If `$0` audio storage is not practical, defer this PRD and keep the rest of the product moving.

## Minimum Data

Voice contribution:

- ID.
- Event ID.
- Type: `voice`.
- Display name.
- Audio URL or storage key.
- Duration.
- Created timestamp.
- Status: `visible`, `hidden`, or `pending`.

## Dependencies

- PRD 01 event detail pages.
- PRD 03 admin moderation.
- Phase 0 storage decision.

## Risks

- Free storage may be too limited for audio.
- Browser recording support may vary.
- Audio spam or abusive content is harder to review quickly.
- Large files may hurt performance or cost.

## Acceptance Criteria

- Visitor can submit a voice memo up to 60 seconds.
- Detail page can play the submitted memo.
- Admin can hide a voice memo.
- Hidden voice memos disappear from public pages.
- The feature can operate at `$0`.

## Test Scenarios

- Record and submit a valid short memo.
- Upload a supported audio file.
- Reject a memo over 60 seconds.
- Reject a file over the configured size limit.
- Hide a memo and confirm public pages exclude it.
- Confirm mobile recording or upload fallback works.
