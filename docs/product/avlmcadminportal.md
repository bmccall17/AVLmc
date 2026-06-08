avlmcadminportal.md
## Desired Outcome / Project Goal

Build the **AVL Music Companion Admin Portal** as the operating dashboard for the full product: not just a place to manage content, but a clear architectural reference for understanding how the whole system works.

The admin portal should make the product legible at a glance: what data comes in, where it goes, what features depend on it, what community signals are being collected, which local resources and partners are connected, and where there are gaps, weak links, or disconnected pieces.

The public product currently presents itself as an Asheville live-music discovery layer: a rolling local music board powered by AVLgo, social/community signals, match cards, Spotify connection, Ryan’s playlist, venue filters, and local event discovery. ([avlmc.vercel.app][1]) The admin portal should explain and manage that ecosystem.

## Product Statement for the Top of the Admin Portal

**AVL Music Companion helps people find the Asheville show worth talking about.**

It turns the local live-music feed into a more human discovery experience by layering community notes, listening signals, venue context, playlist connections, and local recommendations on top of upcoming shows. The goal is not simply to list events, but to help people notice what is happening, understand why it might matter, and feel more connected to Asheville’s music community.

## Admin Portal Purpose Statement

The Admin Portal exists to help the project owner understand, maintain, and improve the AVL Music Companion system.

It should show:

* how event data enters the system
* how AVLgo, Spotify/listening signals, community posts, playlists, venues, tags, and local resources connect
* what content is live, missing, stale, duplicated, or disconnected
* which partners/resources are currently represented
* what still needs editorial, technical, or community attention

## Core Admin Portal Sections

### 1. Architectural Reference

A visual/system reference that shows the live structure of the product:

**Data sources → processing → database/content layer → public experience → social/community layer → partner/resource layer**

It should answer:

* Where does each event come from?
* What fields are available?
* What fields are missing?
* Which features depend on which data?
* What breaks if a source is unavailable?
* Which parts are manual vs. automated?
* Which parts are public-facing vs. admin-only?

### 2. Knowledge Graph

Create a living map of the operation, including:

* Events
* Artists
* Venues
* Tags/genres/vibes
* Playlists
* Community notes
* Song recommendations
* Local partners
* External sources
* Resource links
* Gaps/disconnections

The goal is to expose relationships, not just records. For example:
**White Horse Black Mountain → event → artist → genre tags → community notes → playlist/song recs → partner/resource link**

### 3. Gap / Disconnection View

The admin should clearly flag:

* events with no venue match
* venues with no partner/resource link
* listings with missing images
* events with weak metadata
* duplicates
* stale listings
* dead outbound links
* missing social metadata
* partners/resources that exist but are not surfaced publicly
* local resources that should be connected but are not yet represented

### 4. Product Statement + Social Identity

The top of the admin portal should include the canonical product identity:

* Product name
* Purpose statement
* Short description
* Long description
* Social preview copy
* Favicon
* App icon
* Open Graph image
* Twitter/social image
* Metadata title/description
* Share preview validation status

This matters because Next.js supports structured metadata, favicons, Open Graph images, Twitter images, robots, and sitemap conventions through the App Router metadata system. ([Next.js][2]) Open Graph specifically needs fields like `og:title`, `og:type`, `og:image`, and `og:url`, with `og:description` and image alt text recommended for richer social previews. ([Open Graph Protocol][3])

### 5. Local Resources & Partners

Create a visible admin section for:

* AVLgo source
* Ryan’s playlist
* venues
* local music partners
* community organizations
* press/media resources
* playlist collaborators
* potential sponsors
* venue contacts
* artist/community resources

The public site already surfaces Ryan’s playlist, AVLgo source, and local venue/event discovery, so the admin should make those relationships explicit and maintainable rather than scattered across the UI/codebase. ([avlmc.vercel.app][1])

## One-Sentence Goal

**Build an admin portal that turns AVL Music Companion from a working event board into an understandable, maintainable, and expandable local music discovery system.**

## Stronger Version for a Developer Ticket

Create an `/admin` portal for AVL Music Companion that begins with a canonical Product Statement and a live Architectural Reference / Knowledge Graph. The portal should show how the product is wired together across AVLgo event data, Spotify/listening signals, playlists, community notes, venues, tags, social metadata, local resources, and partner links. It should make gaps obvious: missing metadata, disconnected venues, unlinked partners, weak event records, dead links, duplicate records, and unfinished product surfaces. The admin experience should help the product owner understand the system, maintain the content ecosystem, and make better decisions about what to build next.

[1]: https://avlmc.vercel.app/ "AVL Music Companion"
[2]: https://nextjs.org/docs/app/getting-started/metadata-and-og-images?utm_source=chatgpt.com "Getting Started: Metadata and OG images | Next.js"
[3]: https://ogp.me/ "The Open Graph protocol"
