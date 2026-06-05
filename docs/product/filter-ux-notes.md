# Filter UX Notes

Updated: June 5, 2026

## Problem

The current All venues and All tags dropdowns become overwhelming when AVLgo returns hundreds of venues, tags, and 500+ music events in the rolling 21-day window.

## Direction To Explore

- Surface a short default set of popular filters instead of exposing every venue/tag upfront.
- Rank venues by upcoming event count, then show top 8-12 plus search.
- Rank tags by frequency, but suppress low-signal generic tags and duplicates.
- Consider quick chips for common intents: Tonight, This weekend, Free, Dance, Jazz, Rock, Local, Outdoor.
- Keep full venue/tag search available, but make it secondary.
- Consider grouping venues by neighborhood or recurring/high-volume venues later.

## Recommendation Draft

Replace large dropdowns with compact filter chips for the most common venues/tags, plus a search or More control for the long tail. Default the page to browsing by time and community signal, not taxonomy spelunking.
