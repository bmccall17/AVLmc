stonesoup_forupcomingshowsinthe828.md
## desired outcomes

### 1. turn AVLgo listings into community-powered music discovery

The app helps people see which musicians are coming to Asheville in the next 21 days, then adds the human layer AVLgo and Spotify do not provide by themselves: local context, favorite songs, personal stories, voice notes, and “I’m thinking of going” energy.

### 2. make the homepage useful in under 30 seconds

A visitor should immediately understand:

who is playing soon
where and when they are playing
which artists people are talking about
which shows people may actually attend
which artists are worth exploring first

### 3. allow participation outside of Slack

People should be able to contribute even if they are not in Digital Nomads, not active in Slack, or just received a link from someone.

### 4. keep the first version very lean

The first pass should feel like a simple “who’s coming to town?” discovery board with lightweight community signals, not a full social network.

---

# first-pass product spec

## working title

**AVL Music Companion**

Alternate names:

**Coming Through AVL**
**Who’s Coming to Asheville**
**AVL Show Notes**
**Asheville Listening Board**

---

## product summary

A lightweight web app that pulls upcoming music events from the AVLgo API and displays artists playing in Asheville over a rolling 21-day window. Users can click into an artist or event page to recommend songs, leave short notes, add voice memos, and signal that they are interested in going.

The homepage ranks events chronologically by default, from soonest to furthest out, with simple community badges showing activity and excitement.

---

# MVP scope

## homepage

The homepage displays all music events from AVLgo happening in the next 21 days.

Each card should show:

* artist or band name
* event date
* venue
* start time, if available
* image, if available from AVLgo or artist source
* short event/listing link back to AVLgo
* community signal badges:

  * number of comments
  * number of song recommendations
  * number of voice memos
  * number of people interested in going
  * fire count or “hot” count

Default sort:

**soonest show first**

Optional secondary sort for first pass:

**most active / hottest**

---

## artist or event detail page

When a user clicks a band or event, they see a simple detail page.

The page should include:

* artist or band name
* venue
* date and time
* AVLgo listing link
* embedded or linked music recommendations
* community comments
* voice memos
* “I’m thinking of going” button
* fire / excitement button

Primary user actions:

1. recommend a song
2. leave a note
3. record or upload a short voice memo
4. mark “I’m thinking of going”
5. add fire / excitement signal

---

# contribution types

## song recommendation

User can submit:

* song title
* artist name, prefilled when possible
* Spotify / YouTube / Bandcamp / Apple Music link
* optional short note: “start here because…”

## text note

User can submit a short message such as:

* “saw them at Grey Eagle last year and they were incredible”
* “great songwriter, quiet-room kind of show”
* “this one is worth catching if you like Jason Isbell”
* “I’m planning to go Friday”

## voice memo

User can record or upload a short voice memo.

Suggested first-pass limit:

**60 seconds max**

Stored with:

* audio file
* display name
* timestamp
* optional transcript later, not required for MVP

## intent signal

Simple button:

**I’m thinking of going**

This increments a count on the card and detail page.

Optional label shown publicly:

**7 people thinking of going**

## fire signal

Simple button:

🔥

This is a lightweight excitement marker.

Optional label:

**hot this week**

---

# minimum data model

## event

```text
id
avlgo_event_id
artist_name
event_title
venue_name
event_date
event_time
event_url
image_url
source
created_at
updated_at
```

## contribution

```text
id
event_id
type: song | comment | voice
display_name
body_text
song_title
song_url
audio_url
created_at
status: visible | hidden | pending
```

## reaction

```text
id
event_id
type: going | fire
session_id or user_id
created_at
```

For the leanest first pass, use anonymous session-based reactions so the same browser cannot spam the same button repeatedly.

---

# API requirements

The app should pull from the AVLgo API and normalize incoming listings into the local database.

Required fields from AVLgo:

* event id
* artist or event title
* venue
* date
* time
* listing URL
* image, if available
* category or tag to filter for music events

Sync behavior:

* pull all music events happening from today through the next 21 days
* refresh at least once daily
* preserve local community contributions even when event listings refresh
* remove or hide events after they have passed

---

# pages needed

## 1. homepage

Path:

```text
/
```

Purpose:

Show the rolling 21-day list of upcoming music events.

Core elements:

* title
* short explanation
* event cards
* sort toggle, optional
* link to AVLgo source

## 2. event detail page

Path:

```text
/event/[id]
```

Purpose:

Show one artist/event and all community contributions.

Core elements:

* event info
* song recommendations
* notes
* voice memos
* going button
* fire button
* contribution form

## 3. simple admin/moderation page

Path:

```text
/admin
```

Purpose:

Allow someone trusted to hide spam or bad submissions.

Core elements:

* list recent contributions
* hide/unhide contribution
* filter by pending, visible, hidden

For MVP, this can be password-protected with a single admin password.

---

# key interaction flow

## visitor discovers a show

1. user lands on homepage
2. sees upcoming shows in chronological order
3. notices badges on a card:

   * 4 song recs
   * 3 comments
   * 6 going
   * 🔥 9
4. clicks artist/event
5. listens to recommended song
6. reads community notes
7. clicks “I’m thinking of going”
8. optionally adds their own song or note

---

# MVP acceptance criteria

A developer team should consider the first pass complete when:

* the app displays AVLgo music events for the next rolling 21 days
* events are sorted soonest first
* each event has a shareable detail page
* users can submit a song recommendation
* users can submit a text note
* users can add a fire reaction
* users can mark that they are thinking of going
* homepage cards show counts for songs, notes, fire, and going
* contributions persist after AVLgo data refreshes
* past events disappear or move out of the main homepage view
* admin can hide inappropriate or spammy submissions
* the site works well on mobile

---

# recommended first-pass constraints

To keep the build lean:

* no full user accounts
* no private messaging
* no calendar integration
* no ticketing
* no complex profiles
* no personalized recommendations
* no Slack integration in V1
* no AI summaries in V1
* no playlist generation in V1 unless already easy from existing work

Identity can be simple:

```text
display name optional
email not required
anonymous allowed
```

Spam protection:

```text
honeypot field
basic rate limit
admin hide function
one reaction per browser session per event
```

---

# open questions for dev team

1. What fields are available from the AVLgo API for music events?
2. Can the AVLgo API reliably distinguish music events from other events?
3. Should the primary object be an **event** or an **artist**?
4. How should duplicate artists be handled if they play multiple shows in 21 days?
5. Is voice memo recording in-browser included in V1, or should V1 allow audio uploads only?
6. Where should audio files be stored?
7. Should submissions appear immediately or require admin approval?
8. Should the app link back to AVLgo on every event card?
9. What is the simplest hosting/database/storage setup for the first pass?

---

# developer-ready build request

Build a lightweight web app that pulls upcoming Asheville music events from the AVLgo API and displays a rolling 21-day list of artists/events, sorted by soonest first.

Each event should have a detail page where visitors can contribute community context: song recommendations, short text notes, voice memos, “I’m thinking of going” signals, and fire/excitement reactions.

The homepage should show visible community badges on each event card so visitors can quickly see which artists people are talking about, recommending, and planning to see.

The first version should avoid accounts, profiles, messaging, ticketing, or complex social features. Prioritize mobile-friendly browsing, low-friction contributions, persistent community notes, and basic admin moderation.
