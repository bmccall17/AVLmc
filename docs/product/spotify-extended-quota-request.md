# Spotify Extended Quota Mode — request draft & submission runbook

> **⚠️ Outdated as the primary strategy (annotated July 4, 2026).** Spotify's **April 15, 2025**
> criteria change reserves Extended Quota for **legally-registered businesses** running a launched
> service at **~250,000 MAU** (individuals no longer accepted), and Development Mode tightened to **5**
> Premium test users. For this free, local, private-beta app the grant is effectively unreachable, so
> the shipped answer is the **seat-free taste import** (upload a playlist export → parsed to
> `music_profile_items` → `artistAffinity`; no API call, no seat) — see
> [PRD 45](prds/prd-45-extended-quota-readiness.md) and `lib/taste-import-core.ts`. This runbook is kept
> for the record and in case Spotify's criteria change again; do not treat it as the path to unblock
> taste personalization.

**Why:** AVLmc's app-only (Client Credentials) token can call `GET /v1/search?type=artist` but
`GET /v1/artists/{id}/top-tracks` returns **HTTP 403** under Spotify **Development Mode**. That 403
is Spotify's post-2024 restriction on apps that don't have **Extended Quota Mode**. It blocks the
hover-play preview playlist (PRD 46, Story E). The artist **embed** already works (it's a plain
iframe, no API), so this request only unlocks the *preview tracks* / hover-play layer.

**What this changes if granted:**
- `top-tracks` (and other restricted catalog endpoints) return `200` for our app token → the
  backfill's track top-up fills `event_artist_tracks`.
- `preview_url` *may* return (Spotify deprecated 30-second previews broadly; Extended Quota is the
  only path that can restore them, but it is not guaranteed — see the caveat at the bottom).
- The 25-user cap on *user* OAuth (taste personalization) is also lifted.

---

## 1. Where to submit

1. Sign in at **https://developer.spotify.com/dashboard** with the account that owns the AVLmc app
   (the one holding `AUTH_SPOTIFY_ID` / `AUTH_SPOTIFY_SECRET`).
2. Open the **AVLmc** app → **Settings** (or the app overview). Look for the quota banner /
   **"Extended Quota Mode"** section and click **Request Extension** (labels shift; it may read
   "Request an extension" or appear under a "Quota" tab).
3. Complete the request form. Spotify's form fields change periodically; the **paste-ready answers
   in §2** map to the questions it asks today. Copy each into the matching field.
4. Submit. Review typically takes a few days to a couple of weeks; Spotify emails the owner account
   with the decision or follow-up questions.

> Before submitting, make sure the app's **Settings** are complete and accurate: App name, a real
> description, the **App website** (`https://avlmc.vercel.app`), and **Redirect URIs**. Reviewers
> open the app, so it must be reachable and must show Spotify attribution.

---

## 2. Paste-ready answers

**App name**
> AVL Music Companion (AVLmc)

**App website / where it's available**
> https://avlmc.vercel.app

**Which best describes your app? / Category**
> Music discovery — a free community events board for a single city's live-music scene.

**Describe your app and what it does**
> AVL Music Companion is a free, non-commercial web app that helps people in Asheville, North
> Carolina discover upcoming live-music shows. It aggregates local event listings and, for each
> show, resolves the performing artist to their Spotify artist page so a visitor can hear who's
> playing before deciding to go. Every event page leads with Spotify's official artist embed —
> exactly like a venue's own event pages — so a listener can press play with no account required.

**How does your app use the Spotify Platform? Which endpoints?**
> - App-only Client Credentials token for catalog reads only:
>   - `GET /v1/search?type=artist` — resolve an event's artist name to a Spotify artist.
>   - `GET /v1/artists/{id}/top-tracks?market=US` — the matched artist's popular tracks, used to
>     offer optional 30-second preview playback and a track list on the event page.
> - We render Spotify's official artist **embed** iframe
>   (`https://open.spotify.com/embed/artist/{id}`) on each event page.
> - Optional per-user Authorization Code (OAuth) flow for read-only taste personalization
>   (`GET /v1/me/top/artists`, `/v1/me/top/tracks`) so signed-in listeners get better recommendations.
> - We only match on **exact, normalized artist-name matches** to auto-publish an embed; anything
>   ambiguous is held for human review so we never show the wrong artist.

**Does your app write to Spotify or modify user data?**
> No. The app is strictly read-only. It never creates or edits playlists, never saves tracks, and
> never modifies any user's Spotify library.

**Is your app monetized / commercial?**
> No. It is a free, non-commercial community project with no ads, no subscriptions, and no resale of
> Spotify data.

**Expected number of users**
> Small and local — the Asheville, NC live-music community. Currently in private beta.

**Instructions for the reviewer to access/test the app**
> Visit https://avlmc.vercel.app — no login is required. Open any event detail page (e.g. an
> upcoming show at The Orange Peel or Asheville Music Hall) to see the embedded Spotify artist
> player. The board and all listings are fully usable anonymously.

**How do you store Spotify data?**
> We store only the minimal identifiers needed to render embeds: the matched Spotify artist ID,
> name, and image URL per event, and (once accessible) the artist's top-track IDs and preview URLs.
> We do not bulk-store the catalog, do not use any Spotify data to train models, and do not
> cross-reference it with other datasets. Data is refreshable and tied to public event listings.

**Compliance confirmations (check all that apply)**
> - We comply with the Spotify Developer Terms and the Developer Policy.
> - We follow the Spotify Design Guidelines: official embeds, the Spotify logo/attribution, and
>   "Open in Spotify" links back to Spotify.
> - We do not use Spotify content for machine-learning/AI training.
> - We are not building a service that competes with Spotify.
> - We do not attempt to download or make Spotify audio available for offline use.

---

## 3. After approval — light up hover-play (no code changes)

1. Re-run the artist-match backfill so the track top-up fills previews for existing matches:
   - `BASE_URL=https://avlmc.vercel.app npm run backfill:artist-matches`, **or**
   - hit `https://avlmc.vercel.app/api/sync/artist-match?limit=100` a few times.
   The top-up (`backfillMissingArtistTracks`) retries `top-tracks` for every published match that has
   no tracks — it stops hammering only while it sees a 403, so once that clears it fills normally.
2. Verify in Neon:
   ```sql
   select count(*) as tracks,
          count(*) filter (where preview_url is not null) as with_preview
   from public.event_artist_tracks;
   ```
   `tracks > 0` means `top-tracks` is unlocked; `with_preview > 0` means hover-play will actually
   play audio.
3. The board's "♫ N songs" chip and hover fade-in start working automatically — no deploy needed;
   the code already consumes these rows.

---

## 4. Honest caveat

Extended Quota Mode is the correct and only remedy for the `top-tracks` **403**, and lifting it will
let the endpoint return `200`. However, Spotify's 2024 deprecation of **30-second `preview_url`s**
was broad, and there is no guarantee previews return even with Extended Quota. Two outcomes:

- **`top-tracks 200` + non-null `preview_url`** → full hover-play works.
- **`top-tracks 200` + null `preview_url`** → we get the track list/ordering but no MP3 to play on
  hover; hover-play stays dormant and the board degrades to "open to listen" (already handled).

Either way, the **artist embed keeps working** — inside its iframe Spotify still serves 30-second
previews to anonymous visitors and full tracks to logged-in Spotify users, independent of our API
access. So the primary deliverable is unaffected by the outcome of this request.
