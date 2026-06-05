# PRD 01: MVP Event Discovery Board

## Summary

Build the first useful version of the AVL Music Companion: a mobile-friendly web app that shows upcoming Asheville music events from AVLgo over a rolling 21-day window.

This phase proves the core browsing experience before adding community features.

## Implementation Status

Built in the Next.js app. The homepage uses AVLgo's public JSON export with a rolling Live Music window, client-side filtering/sorting, stable detail routes, source links, and a daily sync endpoint.

## Goals

- Show music events happening from today through the next 21 days.
- Sort events by soonest show first.
- Give each event a shareable detail page.
- Link back to the original AVLgo listing.
- Keep implementation compatible with a `$0` launch stack.

## Non-Goals

- No full user accounts.
- No contributions or reactions in this phase.
- No voice memos.
- No playlist generation.
- No paid services.

## Requirements

### Homepage

Path: `/`

The homepage must show:

- App title and short purpose.
- Rolling 21-day event list.
- Event cards sorted soonest first.
- Artist or event title.
- Venue.
- Date.
- Start time when available.
- Image when available.
- Link to AVLgo source listing.
- Empty state when no events are available.

### Event Detail Page

Path: `/event/[id]`

The detail page must show:

- Artist or event title.
- Venue.
- Date and time.
- Image when available.
- AVLgo listing link.
- Placeholder areas for future songs, notes, reactions, and voice memos.

### AVLgo Sync

The sync process must:

- Pull events from today through the next 21 days.
- Filter to music events when AVLgo provides reliable category or tag data.
- Normalize AVLgo listings into local event records.
- Preserve local IDs across refreshes when the AVLgo event ID is stable.
- Hide or move past events out of the main homepage view.
- Refresh at least once daily after launch.

### Minimum Event Data

Store enough data to support the MVP:

- Local event ID.
- AVLgo event ID.
- Artist or event title.
- Venue name.
- Event date.
- Event time when available.
- AVLgo listing URL.
- Image URL when available.
- Source name.
- Created and updated timestamps.

## Dependencies

- AVLgo API access and field confirmation.
- Phase 0 stack decision for `$0` hosting and data storage.
- Decision on how to identify music events from AVLgo data.

## Risks

- AVLgo may not expose images or exact start times.
- AVLgo may not reliably distinguish music events.
- Duplicate or recurring events may require cleanup rules.
- Event-first URLs may need adjustment if artist-first pages become more useful.

## Acceptance Criteria

- The homepage displays upcoming AVLgo music events for the next rolling 21 days.
- Events are sorted soonest first.
- Each event opens a stable, shareable detail page.
- Each event links back to AVLgo.
- Past events no longer appear in the main list.
- The app works well on mobile.
- The implementation can run at `$0`.

## Test Scenarios

- Event with full data renders correctly.
- Event missing image still renders cleanly.
- Event missing start time still renders cleanly.
- No available events shows an empty state.
- Past event is excluded from the homepage.
- Duplicate AVLgo event ID updates the existing local record instead of creating a duplicate.
