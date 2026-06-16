## Saved/Favorites & Richer Genre Matching — Desired Outcomes

These are the next Personalized Discovery follow-ups (see [`personalized-discovery-backlog.md`](personalized-discovery-backlog.md) → "Remaining Follow-Up"). This document defines what "done" looks like so direction can be verified before an implementation plan is written. Spotify library/playlist write actions are intentionally **parked** for a future phase (Outcome 9).

### Saved / Favorites

#### 1. A personal home for the music you care about

Done looks like a signed-in listener having a dedicated **Saved** space that collects the **events**, **venues**, and **artists** they have favorited, each as its own clearly separated list. The lists are easy to scan, show enough context to recognize each item (event date/venue, venue name, artist name), and let the person open or un-save any item quickly.

#### 2. Favoriting is a first-class, distinct action

Done looks like "Save" being a deliberate, recognizable action that is **separate from "planning to go" and "fire"**—a way to bookmark something worth remembering without committing to attend or hyping it publicly. A person can favorite an event from the board or its detail page, a venue from a venue context, and an artist from an event's lineup or recommendation, and immediately see it reflected in their Saved space.

#### 3. Signing in is encouraged, not required to browse

Done looks like saving being a **signed-in benefit** that gives people a concrete reason to create an account, while the public board stays fully usable anonymously. When an anonymous person fires, plans to go, or removes an event, they are gently **nudged to sign in**—framed as "keep this and help tune your recommendations," not as a wall. The nudge preserves the action they were taking so signing in feels like a reward, not a restart.

#### 4. Favorites strengthen recommendations

Done looks like favorited venues and artists **feeding discovery scoring** so the board surfaces more of what a person has signaled they value—reusing the existing preference/custom-signal model rather than acting as an isolated bookmark list. Favoriting an artist or venue measurably nudges similar upcoming shows up the ranking, and the person can see that their saved items are influencing what they're shown.

#### 5. Honest, private, and reversible

Done looks like the Saved space being **private to the person** (no public profiles), every save being **easily reversible**, and saved data respecting the same privacy posture as the rest of personalization—no raw Spotify tokens, clean delete/disconnect behavior, and no surprise data exposure in public responses.

### Richer Genre Matching

#### 6. Genre understanding beyond a flat tag list

Done looks like the app recognizing genres through a **curated taxonomy with aliases and relationships** (e.g. synonyms, and parent/child links such as jazz → funk → soul) instead of a short hardcoded term list. This improves matching for **everyone, including anonymous users**, so the public board's Best Bets and genre filters feel smarter without requiring a login.

#### 7. Real taste signal for connected listeners

Done looks like **Spotify artist genres** being captured during sync and used to match a connected listener's actual taste against an event's genre profile—a richer signal than artist-name matching alone. This layers on top of the taxonomy so signed-in Spotify users get noticeably more relevant matches, while the public experience still improves from the taxonomy alone.

#### 8. Explainable and tunable

Done looks like richer genre matches remaining **explainable**—event cards can show a short, truthful reason ("genre match: jazz / soul")—and continuing to respect the existing **`genreMatch` preference weight** so a person can dial how much genre influences their ranking. No private Spotify values are exposed in these reasons.

### Parked — Spotify Library / Playlist Write Actions

#### 9. Deferred for a future phase

Done looks like Spotify **save-to-library, follow-artist, and playlist** actions being **explicitly parked**, not built in this phase. The intent is recorded so it isn't lost, with a clear note that these require **new OAuth write scopes** (`user-library-modify`, `user-follow-modify`, `playlist-modify-public`/`playlist-modify-private`) and **re-authentication of existing connected users**. They will only be planned when the product is ready to write to Spotify.
