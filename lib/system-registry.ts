/**
 * System Registry — the single source of truth for how AVL Music Companion is wired.
 *
 * This module is the SPINE of the Admin Portal initiative (PRD 06 / Cycle C1). It is a
 * typed, version-controlled model of the product as a graph of nodes (surfaces, services,
 * datastores, integrations, jobs, external sources, partners) and the edges (data flows and
 * dependencies) between them.
 *
 * It is consumed by:
 *   - the visual architecture graph (Outcome 1) — components/admin/ArchitectureSection.tsx
 *   - the agent-readable export (Outcome 3) — app/api/admin/system-map/route.ts + docs/product/system-map.generated.md
 *   - health overlays (Outcome 4, PRD 07) — via the reserved `healthProbeId` field
 *   - stewardship entity views (Outcome 6, PRD 08) — via datastore nodes
 *   - the listener-taste-graph backdrop (Outcome 2, PRD 10)
 *
 * IMPORTANT: this file is intentionally pure (no database or `server-only` imports) so it can
 * be imported by the markdown generator script and the drift-guard test without a DB. Live
 * counts and health are stitched in at request time by `lib/admin/registry.ts`.
 *
 * Keep node granularity at the service / table / integration level — model the architecture a
 * maintainer needs, not every function. When you add or rename a backing file or table, update
 * the matching node's `sourceOfTruth`; the drift guard (tests/system-registry.test.ts) fails if
 * a node points at a file or table that no longer exists.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type NodeKind =
  | "surface" // a route or rendered component
  | "service" // a lib/* module that does work
  | "datastore" // a Postgres table
  | "integration" // a wired external system (AVLgo, Auth.js/Spotify, Vercel Blob, Umami)
  | "job" // a scheduled (cron) process
  | "external_source" // an upstream data source we read from
  | "partner"; // an ecosystem relationship

/** Where the node sits in the high-level left-to-right system view. */
export type SystemLayer =
  | "sources"
  | "processing"
  | "data"
  | "experience"
  | "community"
  | "identity"
  | "operations"
  | "partners";

/** Who can reach this node. */
export type NodeAccess = "public" | "admin" | "internal";

/** How the node's data is maintained. */
export type NodeOwnership = "automated" | "manual" | "hybrid";

/**
 * Stable keys for the live counts stitched in at request time. The static model only declares
 * WHICH count belongs on a node (`countKey`); `lib/admin/registry.ts` resolves the number.
 */
export type DerivedCountKey =
  | "events"
  | "venues"
  | "contributions"
  | "reactions"
  | "event_intents"
  | "event_interaction_events"
  | "event_person_event_state"
  | "users"
  | "accounts"
  | "user_emails"
  | "spotify_access_requests"
  | "music_connections"
  | "music_profile_items"
  | "listener_discovery_preferences"
  | "spotify_event_match_corrections"
  | "system_job_runs"
  | "admin_resources"
  | "saved_items"
  | "event_shared_songs"
  | "listener_follows"
  | "curators"
  | "curator_picks";

export type RegistryNode = {
  /** Stable identifier; referenced by edges and by later cycles. Never reuse or repurpose. */
  id: string;
  kind: NodeKind;
  layer: SystemLayer;
  /** Human label shown in the graph. */
  label: string;
  /** One- or two-sentence plain-language description. */
  description: string;
  /**
   * Where this node's source-of-truth lives: a repo-relative file path (e.g. `lib/events.ts`)
   * or, for `datastore` nodes, a Postgres table name (e.g. `events`). The drift guard validates
   * file paths against the working tree and table names against `db/schema.sql`.
   */
  sourceOfTruth: string;
  access: NodeAccess;
  ownership: NodeOwnership;
  /** Configuration this node needs. NAMES ONLY — values never appear in the registry. */
  envVars?: string[];
  /** Reserved for PRD 07: id of the health probe that reports this node's live status. */
  healthProbeId?: string;
  /** Which live count (if any) attaches to this node. */
  countKey?: DerivedCountKey;
  /**
   * True when the node represents a system that lives OUTSIDE this repo (AVLgo, Spotify, Vercel
   * Blob, Umami, a partner). Used only for presentation — the boundary of "our code". Its
   * `sourceOfTruth` still points at where it is wired in code and is drift-checked like any other
   * node (the guard only skips `http(s)://` locators).
   */
  external?: boolean;
  /** Optional outbound link shown in the node detail (docs, dashboard, external site). */
  docHref?: string;
};

export type EdgeKind = "flowsTo" | "dependsOn";

export type RegistryEdge = {
  from: string;
  to: string;
  kind: EdgeKind;
  /** Short description of what moves across the edge, e.g. "daily upsert", "ranked order". */
  label?: string;
};

export type SystemRegistry = {
  nodes: RegistryNode[];
  edges: RegistryEdge[];
};

/* ------------------------------------------------------------------ */
/*  Layer metadata (drives the high-level graph layout & legend)       */
/* ------------------------------------------------------------------ */

export const SYSTEM_LAYERS: Array<{
  id: SystemLayer;
  label: string;
  blurb: string;
}> = [
  { id: "sources", label: "Sources", blurb: "Where raw data originates" },
  { id: "processing", label: "Processing", blurb: "Normalize, dedupe, rank" },
  { id: "data", label: "Data Stores", blurb: "Postgres tables of record" },
  { id: "experience", label: "Public Experience", blurb: "What listeners see" },
  { id: "community", label: "Community", blurb: "Listener-contributed signal" },
  { id: "identity", label: "Identity & Taste", blurb: "Optional sign-in & personalization" },
  { id: "operations", label: "Operations", blurb: "Jobs, admin, observability" },
  { id: "partners", label: "Partners", blurb: "Ecosystem relationships" },
];

export const NODE_KIND_LABELS: Record<NodeKind, string> = {
  surface: "Surface",
  service: "Service",
  datastore: "Data store",
  integration: "Integration",
  job: "Scheduled job",
  external_source: "External source",
  partner: "Partner",
};

/* ------------------------------------------------------------------ */
/*  Nodes                                                              */
/* ------------------------------------------------------------------ */

const NODES: RegistryNode[] = [
  /* ---- Sources --------------------------------------------------- */
  {
    id: "src-avlgo",
    kind: "external_source",
    layer: "sources",
    label: "AVLgo Export",
    description:
      "Primary upstream event feed (avlgo.com JSON export). Read on a daily schedule and on demand.",
    sourceOfTruth: "lib/events.ts",
    access: "public",
    ownership: "automated",
    envVars: ["AVLGO_API_URL"],
    external: true,
    healthProbeId: "avlgo-feed",
    docHref: "https://www.avlgo.com",
  },
  {
    id: "src-seed",
    kind: "external_source",
    layer: "sources",
    label: "Seed Events",
    description:
      "Hardcoded fallback events used when the AVLgo feed is unreachable, so the board never renders empty.",
    sourceOfTruth: "lib/events.ts",
    access: "public",
    ownership: "manual",
  },
  {
    id: "int-spotify",
    kind: "integration",
    layer: "sources",
    label: "Spotify Web API",
    description:
      "Optional. Supplies a signed-in listener's top artists/tracks for taste and powers event artist matching.",
    sourceOfTruth: "lib/music.ts",
    access: "internal",
    ownership: "automated",
    envVars: ["AUTH_SPOTIFY_ENABLED", "AUTH_SPOTIFY_ID", "AUTH_SPOTIFY_SECRET"],
    external: true,
    healthProbeId: "spotify-api",
    docHref: "https://developer.spotify.com/documentation/web-api",
  },

  /* ---- Processing ------------------------------------------------ */
  {
    id: "svc-events",
    kind: "service",
    layer: "processing",
    label: "Event Ingestion",
    description:
      "Fetches the AVLgo feed, normalizes fields, filters to music events, applies the 21-day rolling window, and upserts into the events table.",
    sourceOfTruth: "lib/events.ts",
    access: "internal",
    ownership: "automated",
    envVars: ["AVLGO_API_URL"],
  },
  {
    id: "svc-event-dedupe",
    kind: "service",
    layer: "processing",
    label: "Deduplication",
    description:
      "Groups near-identical events and picks a canonical record, hiding the rest. Surfaces the audit in the admin Gaps tab.",
    sourceOfTruth: "lib/event-dedupe.ts",
    access: "internal",
    ownership: "automated",
  },
  {
    id: "svc-music",
    kind: "service",
    layer: "processing",
    label: "Music Taste Sync",
    description:
      "Pulls a connected listener's Spotify profile into music_connections and music_profile_items, and matches event artists to Spotify.",
    sourceOfTruth: "lib/music.ts",
    access: "internal",
    ownership: "automated",
  },
  {
    id: "svc-shared-songs",
    kind: "service",
    layer: "processing",
    label: "Shared Listening",
    description:
      "When a signed-in listener Goes/Fires an event, resolves the artist's Spotify top tracks and seeds them into the public event_shared_songs list (read-only Spotify; no writes). Computes the per-viewer 'you already love this one' overlap.",
    sourceOfTruth: "lib/shared-songs.ts",
    access: "internal",
    ownership: "automated",
  },
  {
    id: "svc-discovery",
    kind: "service",
    layer: "processing",
    label: "Discovery Scoring",
    description:
      "Ranks events per request by blending taste profile, behavioral signals, and listener-configured weights — including the off-by-default, hard-capped socialCircle component (PRD 26): a viewer's own followed-and-opted-in friends/curators, distinct from anonymous socialHeat. Anonymous visitors get public-signal-only ranking (socialCircle contributes 0).",
    sourceOfTruth: "lib/discovery.ts",
    access: "internal",
    ownership: "automated",
  },
  {
    id: "svc-discovery-memory",
    kind: "service",
    layer: "processing",
    label: "Signal Memory",
    description:
      "Persists and reads per-listener behavioral signals (impressions, opens, fire, planning, removals) that feed discovery scoring.",
    sourceOfTruth: "lib/discovery-memory.ts",
    access: "internal",
    ownership: "automated",
  },
  {
    id: "svc-community",
    kind: "service",
    layer: "processing",
    label: "Community Service",
    description:
      "Validates and stores community contributions, reactions, and ticket/going intents; powers moderation status.",
    sourceOfTruth: "lib/community.ts",
    access: "internal",
    ownership: "hybrid",
  },
  {
    id: "svc-listener-prefs",
    kind: "service",
    layer: "processing",
    label: "Listener Preferences",
    description:
      "Reads and writes a signed-in listener's configurable discovery weights and custom taste signals.",
    sourceOfTruth: "lib/listener-preferences.ts",
    access: "internal",
    ownership: "manual",
  },
  {
    id: "svc-genre-taxonomy",
    kind: "service",
    layer: "processing",
    label: "Genre Taxonomy",
    description:
      "In-code source of truth for genre understanding: canonical genres, alias/synonym maps, and parent/child relationships. Feeds richer, explainable genre matching for everyone and is the vocabulary Spotify genres map onto.",
    sourceOfTruth: "lib/genre-taxonomy.ts",
    access: "public",
    ownership: "manual",
  },
  {
    id: "svc-saved-items",
    kind: "service",
    layer: "processing",
    label: "Saved Items",
    description:
      "Reads and writes a signed-in listener's private Saved/Favorites (events, venues, artists); normalized-name identity for venues/artists shared with discovery scoring.",
    sourceOfTruth: "lib/saved-items.ts",
    access: "internal",
    ownership: "manual",
  },
  {
    id: "svc-social-graph",
    kind: "service",
    layer: "processing",
    label: "Social Graph",
    description:
      "Reads and writes a signed-in listener's private, one-way follow edges (PRD 23). Entitlement-scoped: exposes who the caller follows and their aggregate follower count, never a regular listener's follower identities. Owns canViewActivityOf (follow edge AND the followee's sharing opt-in) for later cycles. Never wired into any public/community/OG response.",
    sourceOfTruth: "lib/social-graph.ts",
    access: "internal",
    ownership: "manual",
  },
  {
    id: "svc-social-activity",
    kind: "service",
    layer: "processing",
    label: "Social Activity (Inner-Circle)",
    description:
      "Inner-circle attribution (PRD 24): a live READ layer that joins the C1 follow graph against existing going/firing (event_person_event_state) and shared-song seeders (event_shared_songs.seeded_by_user_id), returning only activity of followees the viewer follows AND who opted into sharing. No new table — attribution is gated at the SQL join and seeded_by_user_id is resolved to a name server-side, never shipped raw. Empty for anonymous callers; never in any public/community/OG response.",
    sourceOfTruth: "lib/social-activity.ts",
    access: "internal",
    ownership: "manual",
  },
  {
    id: "svc-curators",
    kind: "service",
    layer: "processing",
    label: "Curators",
    description:
      "Admin-promoted curator personas + per-show picks (PRD 25). Public reads expose only the persona + visible picks (never private going/firing, never a non-curator listener, never tokens/PII); admin writes promote/demote/hide and manage picks. Following a curator reuses the C1 listener_follows edge.",
    sourceOfTruth: "lib/curators.ts",
    access: "public",
    ownership: "hybrid",
  },

  /* ---- Data stores ----------------------------------------------- */
  {
    id: "db-events",
    kind: "datastore",
    layer: "data",
    label: "events",
    description: "Canonical normalized music events shown on the board and detail pages.",
    sourceOfTruth: "events",
    access: "internal",
    ownership: "automated",
    countKey: "events",
    healthProbeId: "event-data",
  },
  {
    id: "db-job-runs",
    kind: "datastore",
    layer: "data",
    label: "system_job_runs",
    description: "Append-only record of scheduled job outcomes (start, finish, success/failure, items) for cron observability.",
    sourceOfTruth: "system_job_runs",
    access: "admin",
    ownership: "automated",
    countKey: "system_job_runs",
  },
  {
    id: "db-admin-resources",
    kind: "datastore",
    layer: "data",
    label: "admin_resources",
    description: "Curated partner/resource directory — sources, playlists, venue partners, sponsors, community orgs — managed in the Stewardship tab.",
    sourceOfTruth: "admin_resources",
    access: "admin",
    ownership: "manual",
    countKey: "admin_resources",
  },
  {
    id: "db-contributions",
    kind: "datastore",
    layer: "data",
    label: "contributions",
    description: "Community songs, notes, and voice memos attached to events; carries moderation status.",
    sourceOfTruth: "contributions",
    access: "internal",
    ownership: "hybrid",
    countKey: "contributions",
  },
  {
    id: "db-reactions",
    kind: "datastore",
    layer: "data",
    label: "reactions",
    description: "Lightweight per-session reactions (fire) on events.",
    sourceOfTruth: "reactions",
    access: "internal",
    ownership: "automated",
    countKey: "reactions",
  },
  {
    id: "db-event-intents",
    kind: "datastore",
    layer: "data",
    label: "event_intents",
    description: "Going / ticket-click intents per identity, sourced from avlmc, spotify, or ticket clicks.",
    sourceOfTruth: "event_intents",
    access: "internal",
    ownership: "automated",
    countKey: "event_intents",
  },
  {
    id: "db-interaction-events",
    kind: "datastore",
    layer: "data",
    label: "event_interaction_events",
    description: "Append-only behavioral log (impressions, opens, clicks, fire, planning) feeding discovery.",
    sourceOfTruth: "event_interaction_events",
    access: "internal",
    ownership: "automated",
    countKey: "event_interaction_events",
  },
  {
    id: "db-person-event-state",
    kind: "datastore",
    layer: "data",
    label: "event_person_event_state",
    description: "Per-identity, per-event state (fire / planning / removed) used to personalize and de-duplicate signals.",
    sourceOfTruth: "event_person_event_state",
    access: "internal",
    ownership: "automated",
    countKey: "event_person_event_state",
  },
  {
    id: "db-users",
    kind: "datastore",
    layer: "data",
    label: "users",
    description: "Auth.js user records for signed-in listeners.",
    sourceOfTruth: "users",
    access: "internal",
    ownership: "automated",
    countKey: "users",
  },
  {
    id: "db-accounts",
    kind: "datastore",
    layer: "data",
    label: "accounts",
    description: "Auth.js OAuth account links (provider tokens live here; never exposed to the admin).",
    sourceOfTruth: "accounts",
    access: "internal",
    ownership: "automated",
    countKey: "accounts",
  },
  {
    id: "db-user-emails",
    kind: "datastore",
    layer: "data",
    label: "user_emails",
    description:
      "Multiple verified emails per account (PRD 35): the magic-link email plus the email each linked music platform returns. Global UNIQUE on lower(email) so any email resolves to one identity; users.email stays the primary/display value. Never exposed publicly.",
    sourceOfTruth: "user_emails",
    access: "internal",
    ownership: "automated",
    countKey: "user_emails",
  },
  {
    id: "db-spotify-access-requests",
    kind: "datastore",
    layer: "data",
    label: "spotify_access_requests",
    description:
      "Spotify tester-slot access requests (PRD 36): a not-yet-approved listener's Spotify email + status (pending/slot_added/approved/rejected) while Spotify is in Development Mode (25-user allowlist). One open request per user; the slot add is an external dashboard action this only tracks. The Spotify email is private to listener + admin — never exposed publicly.",
    sourceOfTruth: "spotify_access_requests",
    access: "internal",
    ownership: "automated",
    countKey: "spotify_access_requests",
  },
  {
    id: "db-music-connections",
    kind: "datastore",
    layer: "data",
    label: "music_connections",
    description: "A listener's connected music providers, scopes, sync state, and taste opt-out.",
    sourceOfTruth: "music_connections",
    access: "internal",
    ownership: "automated",
    countKey: "music_connections",
  },
  {
    id: "db-music-profile-items",
    kind: "datastore",
    layer: "data",
    label: "music_profile_items",
    description: "A listener's top artists/tracks pulled from their provider (incl. per-artist genres captured at sync); the raw material of taste.",
    sourceOfTruth: "music_profile_items",
    access: "internal",
    ownership: "automated",
    countKey: "music_profile_items",
  },
  {
    id: "db-listener-prefs",
    kind: "datastore",
    layer: "data",
    label: "listener_discovery_preferences",
    description: "Per-listener discovery weights and custom signals that tune ranking.",
    sourceOfTruth: "listener_discovery_preferences",
    access: "internal",
    ownership: "manual",
    countKey: "listener_discovery_preferences",
  },
  {
    id: "db-spotify-corrections",
    kind: "datastore",
    layer: "data",
    label: "spotify_event_match_corrections",
    description: "Listener corrections to Spotify artist matches (reject / replace) that refine future matching.",
    sourceOfTruth: "spotify_event_match_corrections",
    access: "internal",
    ownership: "hybrid",
    countKey: "spotify_event_match_corrections",
  },
  {
    id: "db-saved-items",
    kind: "datastore",
    layer: "data",
    label: "saved_items",
    description: "Private, polymorphic Saved/Favorites for signed-in listeners: events, venues, and artists. Never exposed in public responses.",
    sourceOfTruth: "saved_items",
    access: "internal",
    ownership: "manual",
    countKey: "saved_items",
  },
  {
    id: "db-listener-follows",
    kind: "datastore",
    layer: "data",
    label: "listener_follows",
    description: "Private, one-way follow edges (follower → followee) for the Social / Curator Graph (PRD 23). Unfollowing deletes the row; on delete cascade keeps it clean. Never exposed in any public/community/OG response.",
    sourceOfTruth: "listener_follows",
    access: "internal",
    ownership: "manual",
    countKey: "listener_follows",
  },
  {
    id: "db-curators",
    kind: "datastore",
    layer: "data",
    label: "curators",
    description: "Admin-promoted public curator personas layered on a user (PRD 25). One row per promoted user; handle is URL-safe + unique. Public persona only — no private/account fields exposed.",
    sourceOfTruth: "curators",
    access: "public",
    ownership: "hybrid",
    countKey: "curators",
  },
  {
    id: "db-curator-picks",
    kind: "datastore",
    layer: "data",
    label: "curator_picks",
    description: "A curator's deliberate, attributed per-show picks (PRD 25). No FK to events (events re-ingest daily) — snapshots event_title and resolves live metadata via a tolerant join at read time.",
    sourceOfTruth: "curator_picks",
    access: "public",
    ownership: "hybrid",
    countKey: "curator_picks",
  },
  {
    id: "db-shared-songs",
    kind: "datastore",
    layer: "data",
    label: "event_shared_songs",
    description: "Public, deduped per-event song list seeded when a signed-in Spotify listener Goes/Fires. Outside discovery scoring. seeded_by_user_id is server-only and never exposed.",
    sourceOfTruth: "event_shared_songs",
    access: "public",
    ownership: "hybrid",
    countKey: "event_shared_songs",
  },

  /* ---- Public experience ----------------------------------------- */
  {
    id: "ui-homepage",
    kind: "surface",
    layer: "experience",
    label: "Homepage",
    description: "The public landing page that renders the ranked event board.",
    sourceOfTruth: "app/page.tsx",
    access: "public",
    ownership: "automated",
  },
  {
    id: "ui-eventboard",
    kind: "surface",
    layer: "experience",
    label: "Event Board",
    description: "Card grid of events with date/venue/tags, reactions, community, and discovery ordering.",
    sourceOfTruth: "components/EventBoard.tsx",
    access: "public",
    ownership: "automated",
  },
  {
    id: "ui-event-detail",
    kind: "surface",
    layer: "experience",
    label: "Event Detail",
    description: "Per-event page with full context, community panel, and share metadata.",
    sourceOfTruth: "app/event/[id]/page.tsx",
    access: "public",
    ownership: "automated",
  },

  /* ---- Community ------------------------------------------------- */
  {
    id: "ui-community-panel",
    kind: "surface",
    layer: "community",
    label: "Community Panel",
    description: "Lets listeners add songs, notes, and voices to an event.",
    sourceOfTruth: "components/CommunityPanel.tsx",
    access: "public",
    ownership: "manual",
  },
  {
    id: "api-community",
    kind: "surface",
    layer: "community",
    label: "Community API",
    description: "Write endpoints for contributions, reactions, and ticket intents.",
    sourceOfTruth: "app/api/community/contributions/route.ts",
    access: "public",
    ownership: "automated",
  },
  {
    id: "api-discovery",
    kind: "surface",
    layer: "community",
    label: "Discovery Action API",
    description: "Logs event interactions and Spotify match corrections that train discovery.",
    sourceOfTruth: "app/api/discovery/event-action/route.ts",
    access: "public",
    ownership: "automated",
  },

  /* ---- Identity & taste ------------------------------------------ */
  {
    id: "int-authjs",
    kind: "integration",
    layer: "identity",
    label: "Auth.js",
    description:
      "Optional sign-in backed by the Postgres adapter: email magic link (Resend, branded dark-mode email — lib/auth-email.ts) plus optional Spotify OAuth.",
    sourceOfTruth: "auth.ts",
    access: "internal",
    ownership: "automated",
    envVars: ["NEXT_PUBLIC_AUTH_ENABLED", "AUTH_SECRET"],
    healthProbeId: "auth-provider",
  },
  {
    id: "api-auth",
    kind: "surface",
    layer: "identity",
    label: "Auth API",
    description: "Auth.js route handler for sign-in, callback, and session.",
    sourceOfTruth: "app/api/auth/[...nextauth]/route.ts",
    access: "public",
    ownership: "automated",
  },
  {
    id: "ui-listener-profile",
    kind: "surface",
    layer: "identity",
    label: "Listener Profile",
    description: "Sign-in, connected accounts, and the taste/discovery settings a listener controls.",
    sourceOfTruth: "components/ListenerProfileButton.tsx",
    access: "public",
    ownership: "manual",
  },
  {
    id: "api-me",
    kind: "surface",
    layer: "identity",
    label: "Listener (me) API",
    description: "Authenticated endpoints for the current listener: connections, profile, preferences, tracks.",
    sourceOfTruth: "app/api/me/route.ts",
    access: "public",
    ownership: "automated",
  },
  {
    id: "api-saved-items",
    kind: "surface",
    layer: "identity",
    label: "Saved Items API",
    description: "Signed-in-only endpoints to list, save, and un-save events, venues, and artists. Returns 401 when anonymous.",
    sourceOfTruth: "app/api/me/saved-items/route.ts",
    access: "public",
    ownership: "automated",
  },
  {
    id: "api-follows",
    kind: "surface",
    layer: "identity",
    label: "Follows API",
    description: "Signed-in-only endpoints to follow, unfollow, and list who the caller follows (+ their own follower count). Returns 401 when anonymous. Never exposes another listener's follower identities or any follow data in a public response.",
    sourceOfTruth: "app/api/me/follows/route.ts",
    access: "public",
    ownership: "automated",
  },
  {
    id: "api-circle-activity",
    kind: "surface",
    layer: "identity",
    label: "Circle Activity API",
    description: "Signed-in-only endpoint returning the viewer's followed-and-opted-in people going to / firing given events (PRD 24). Returns 401/empty when anonymous; never exposes anyone outside the caller's circle.",
    sourceOfTruth: "app/api/me/circle-activity/route.ts",
    access: "public",
    ownership: "automated",
  },
  {
    id: "api-circle-share",
    kind: "surface",
    layer: "identity",
    label: "Circle Share API",
    description: "Signed-in-only, idempotent, best-effort endpoint to share a show/song-list with your circle (PRD 24). Reuses existing going state; no Spotify write, no ranking change.",
    sourceOfTruth: "app/api/me/circle-share/route.ts",
    access: "public",
    ownership: "automated",
  },
  {
    id: "api-me-account-links",
    kind: "surface",
    layer: "identity",
    label: "Account Links API",
    description:
      "Signed-in-only, self-scoped (PRD 35): returns the caller's linked sign-in providers (tokens stripped) and the emails associated with their one account. Backs the profile UI's \"sign in with magic link AND Spotify, one account\" view. Resolves the id from the session, never the body; 401 when anonymous.",
    sourceOfTruth: "app/api/me/account-links/route.ts",
    access: "public",
    ownership: "automated",
  },
  {
    id: "api-me-spotify-access-request",
    kind: "surface",
    layer: "identity",
    label: "Spotify Access Request API",
    description:
      "Signed-in-only listener plane (PRD 36): submit/refresh your OWN Spotify tester-slot access request (your Spotify email → `pending`) and read its status. Exactly one open request per user; the acting id comes from the session, never the body. The Spotify email is private to the listener + admin. Returns 401 when anonymous.",
    sourceOfTruth: "app/api/me/spotify-access-request/route.ts",
    access: "public",
    ownership: "automated",
  },
  {
    id: "api-admin-spotify-access",
    kind: "surface",
    layer: "operations",
    label: "Admin Spotify Access API",
    description:
      "Admin-cookie-gated Spotify tester-slot review (PRD 36): list the open request queue with each listener's Spotify email and mark slot_added/approved/rejected after adding them in the Spotify Developer Dashboard (≤25 users / Extended Quota). The slot add is an external action this only tracks. Admin-only — no self-serve.",
    sourceOfTruth: "app/api/admin/spotify-access/route.ts",
    access: "internal",
    ownership: "automated",
  },
  {
    id: "api-me-curator-application",
    kind: "surface",
    layer: "identity",
    label: "Curator Application API",
    description:
      "Signed-in-only listener plane (PRD 29): submit a self-authored curator application and read your OWN curator standing. Promoted instantly under the self-serve gate, else `pending` for admin review. The acting user id comes from the session, never the body; applications are private to the applicant + admin (never public, no pay-to-play). Returns 401 when anonymous.",
    sourceOfTruth: "app/api/me/curator-application/route.ts",
    access: "public",
    ownership: "automated",
  },
  {
    id: "api-me-curator",
    kind: "surface",
    layer: "identity",
    label: "Curator Self-Management API",
    description:
      "Signed-in-only, self-scoped curator self-management (PRD 31): edit your OWN persona and add / show-hide / remove your OWN picks. The curator + pick ids are resolved from the session and checked in SQL, so a caller can never read or modify another curator. Admin moderation overrides — a non-active row is read-only here. Returns 401 when anonymous.",
    sourceOfTruth: "app/api/me/curator/route.ts",
    access: "public",
    ownership: "automated",
  },
  {
    id: "api-curators",
    kind: "surface",
    layer: "experience",
    label: "Curators API",
    description: "Public curator directory + per-handle profile (PRD 25). Active curators + visible picks only; no private data, no non-curator listeners, no tokens/PII.",
    sourceOfTruth: "app/api/curators/route.ts",
    access: "public",
    ownership: "automated",
  },
  {
    id: "api-admin-curators",
    kind: "surface",
    layer: "operations",
    label: "Admin Curators API",
    description: "Admin-cookie-gated curator management (PRD 25): promote/demote/hide curators, add/hide picks. Admin-only — no self-serve, no pay-to-play.",
    sourceOfTruth: "app/api/admin/curators/route.ts",
    access: "internal",
    ownership: "automated",
  },
  {
    id: "ui-curator-profile",
    kind: "surface",
    layer: "experience",
    label: "Curator Profile",
    description: "Public curator profile page (/curator/[handle]) — persona, top-list, per-show picks, and a Follow button (C1 edge). Plus the /curators directory. Regular listeners never get a public profile.",
    sourceOfTruth: "app/curator/[handle]/page.tsx",
    access: "public",
    ownership: "manual",
  },
  {
    id: "ui-saved-space",
    kind: "surface",
    layer: "identity",
    label: "Saved Space",
    description: "Signed-in-only /saved view with three private lists (events, venues, artists), inline un-save, and empty states. Anonymous visitors are redirected to sign-in.",
    sourceOfTruth: "app/saved/page.tsx",
    access: "public",
    ownership: "manual",
  },

  /* ---- Operations ------------------------------------------------ */
  {
    id: "job-avlgo-sync",
    kind: "job",
    layer: "operations",
    label: "AVLgo Sync (cron)",
    description: "Daily scheduled refresh of events from the AVLgo feed (10:00 UTC).",
    sourceOfTruth: "app/api/sync/avlgo/route.ts",
    access: "internal",
    ownership: "automated",
    healthProbeId: "cron-avlgo-sync",
  },
  {
    id: "job-cleanup",
    kind: "job",
    layer: "operations",
    label: "Image Cleanup (cron)",
    description: "Daily scheduled cleanup of stale cached event images from blob storage (11:00 UTC).",
    sourceOfTruth: "app/api/sync/cleanup/route.ts",
    access: "internal",
    ownership: "automated",
    healthProbeId: "cron-cleanup",
  },
  {
    id: "int-blob",
    kind: "integration",
    layer: "operations",
    label: "Vercel Blob",
    description: "Stores cached event images so cards stay fast and the upstream feed isn't hammered.",
    sourceOfTruth: "lib/blob-storage.ts",
    access: "internal",
    ownership: "automated",
    envVars: ["BLOB_READ_WRITE_TOKEN"],
    external: true,
    healthProbeId: "blob-storage",
  },
  {
    id: "int-umami",
    kind: "integration",
    layer: "operations",
    label: "Umami Analytics",
    description: "Privacy-friendly web analytics. The tracking script runs on public pages; traffic/referrer/page stats are read back into the admin Analytics tab server-side via the Umami Cloud API.",
    sourceOfTruth: "app/layout.tsx",
    access: "internal",
    ownership: "automated",
    envVars: ["NEXT_PUBLIC_UMAMI_WEBSITE_ID"],
    external: true,
    healthProbeId: "umami",
    docHref: "https://umami.is",
  },
  {
    id: "svc-admin-data",
    kind: "service",
    layer: "operations",
    label: "Admin Data Loader",
    description: "Aggregates counts, completeness, gaps, and stats for the admin portal (read-only).",
    sourceOfTruth: "lib/admin-data.ts",
    access: "admin",
    ownership: "automated",
  },
  {
    id: "svc-registry",
    kind: "service",
    layer: "operations",
    label: "System Registry",
    description: "This model. The hand-authored source of truth for the architecture graph, agent export, and health overlays.",
    sourceOfTruth: "lib/system-registry.ts",
    access: "admin",
    ownership: "manual",
  },
  {
    id: "ui-admin",
    kind: "surface",
    layer: "operations",
    label: "Admin Portal",
    description: "Password-gated operating console: health, architecture, knowledge graph, stewardship, insight, analytics.",
    sourceOfTruth: "components/AdminPortal.tsx",
    access: "admin",
    ownership: "manual",
    envVars: ["ADMIN_PASSWORD", "ADMIN_SESSION_TOKEN"],
  },

  /* ---- Partners -------------------------------------------------- */
  {
    id: "partner-ryan-playlist",
    kind: "partner",
    layer: "partners",
    label: "Ryan's Playlist",
    description: "Curated Spotify playlist featured in the navigation — the first ecosystem partner connection.",
    sourceOfTruth: "components/EventBoard.tsx",
    access: "public",
    ownership: "manual",
    external: true,
    docHref: "https://open.spotify.com/playlist/4fcdaCe97lEeEMe8rOhuSM",
  },
];

/* ------------------------------------------------------------------ */
/*  Edges                                                             */
/* ------------------------------------------------------------------ */

const EDGES: RegistryEdge[] = [
  // Ingestion pipeline
  { from: "src-avlgo", to: "svc-events", kind: "flowsTo", label: "daily JSON export" },
  { from: "src-seed", to: "svc-events", kind: "flowsTo", label: "fallback when feed down" },
  { from: "job-avlgo-sync", to: "svc-events", kind: "dependsOn", label: "scheduled trigger" },
  { from: "svc-events", to: "svc-event-dedupe", kind: "flowsTo", label: "normalized rows" },
  { from: "svc-event-dedupe", to: "db-events", kind: "flowsTo", label: "upsert canonical" },
  { from: "svc-events", to: "int-blob", kind: "flowsTo", label: "cache images" },

  // Public experience
  { from: "db-events", to: "svc-discovery", kind: "flowsTo", label: "candidate events" },
  { from: "svc-discovery", to: "ui-eventboard", kind: "flowsTo", label: "ranked order" },
  { from: "db-events", to: "ui-eventboard", kind: "flowsTo", label: "event rows" },
  { from: "ui-eventboard", to: "ui-homepage", kind: "flowsTo", label: "renders into" },
  { from: "ui-homepage", to: "ui-event-detail", kind: "flowsTo", label: "navigates to" },
  { from: "db-events", to: "ui-event-detail", kind: "flowsTo", label: "event by id" },

  // Discovery signals
  { from: "svc-discovery", to: "svc-discovery-memory", kind: "dependsOn", label: "reads signals" },
  { from: "svc-discovery-memory", to: "db-interaction-events", kind: "flowsTo", label: "append log" },
  { from: "svc-discovery-memory", to: "db-person-event-state", kind: "flowsTo", label: "per-event state" },
  { from: "api-discovery", to: "svc-discovery-memory", kind: "flowsTo", label: "logs actions" },
  { from: "api-discovery", to: "db-spotify-corrections", kind: "flowsTo", label: "match corrections" },
  { from: "ui-eventboard", to: "api-discovery", kind: "flowsTo", label: "interaction events" },

  // Taste / personalization
  { from: "int-spotify", to: "svc-music", kind: "flowsTo", label: "top artists/tracks" },
  { from: "svc-music", to: "db-music-connections", kind: "flowsTo", label: "connection state" },
  { from: "svc-music", to: "db-music-profile-items", kind: "flowsTo", label: "taste items" },
  { from: "db-music-profile-items", to: "svc-discovery", kind: "flowsTo", label: "taste weights" },
  { from: "svc-listener-prefs", to: "db-listener-prefs", kind: "flowsTo", label: "saved weights" },
  { from: "db-listener-prefs", to: "svc-discovery", kind: "flowsTo", label: "custom weights" },
  { from: "svc-genre-taxonomy", to: "svc-discovery", kind: "flowsTo", label: "genre matching" },
  { from: "db-spotify-corrections", to: "svc-music", kind: "flowsTo", label: "refines matching" },

  // Shared Listening (PRD 17)
  { from: "int-spotify", to: "svc-shared-songs", kind: "flowsTo", label: "artist top tracks" },
  { from: "api-discovery", to: "svc-shared-songs", kind: "flowsTo", label: "seed on going/fire" },
  { from: "svc-shared-songs", to: "db-shared-songs", kind: "flowsTo", label: "upsert shared songs" },
  { from: "db-shared-songs", to: "ui-event-detail", kind: "flowsTo", label: "shared listening" },
  { from: "db-shared-songs", to: "ui-eventboard", kind: "flowsTo", label: "compact affordance" },

  // Community
  { from: "ui-community-panel", to: "api-community", kind: "flowsTo", label: "writes" },
  { from: "api-community", to: "svc-community", kind: "dependsOn" },
  { from: "svc-community", to: "db-contributions", kind: "flowsTo", label: "songs/notes/voices" },
  { from: "svc-community", to: "db-reactions", kind: "flowsTo", label: "fire" },
  { from: "svc-community", to: "db-event-intents", kind: "flowsTo", label: "going/ticket" },
  { from: "ui-event-detail", to: "ui-community-panel", kind: "flowsTo", label: "embeds" },

  // Identity & taste wiring
  { from: "api-auth", to: "int-authjs", kind: "dependsOn" },
  { from: "int-authjs", to: "db-users", kind: "flowsTo", label: "user records" },
  { from: "int-authjs", to: "db-accounts", kind: "flowsTo", label: "oauth links" },
  { from: "int-authjs", to: "db-user-emails", kind: "flowsTo", label: "records provider email" },
  { from: "db-user-emails", to: "db-users", kind: "dependsOn", label: "emails per account (cascade)" },
  { from: "api-me-account-links", to: "db-user-emails", kind: "dependsOn", label: "linked providers + emails" },
  { from: "db-spotify-access-requests", to: "db-users", kind: "dependsOn", label: "request per user (cascade)" },
  { from: "api-me-spotify-access-request", to: "db-spotify-access-requests", kind: "dependsOn", label: "submit + my status" },
  { from: "api-admin-spotify-access", to: "db-spotify-access-requests", kind: "dependsOn", label: "review queue + slot-added" },
  { from: "ui-listener-profile", to: "api-me", kind: "flowsTo", label: "reads/writes" },
  { from: "api-me", to: "svc-music", kind: "dependsOn", label: "sync taste" },
  { from: "api-me", to: "svc-listener-prefs", kind: "dependsOn", label: "save settings" },
  { from: "api-saved-items", to: "svc-saved-items", kind: "dependsOn", label: "save/list/remove" },
  { from: "svc-saved-items", to: "db-saved-items", kind: "flowsTo", label: "persist saves" },
  { from: "db-saved-items", to: "db-users", kind: "dependsOn", label: "owned by user (cascade)" },
  { from: "ui-eventboard", to: "api-saved-items", kind: "flowsTo", label: "save events/venues/artists" },
  { from: "ui-event-detail", to: "api-saved-items", kind: "flowsTo", label: "save from detail" },
  { from: "svc-saved-items", to: "ui-saved-space", kind: "flowsTo", label: "grouped saved lists" },
  { from: "ui-saved-space", to: "api-saved-items", kind: "flowsTo", label: "inline un-save" },
  { from: "api-follows", to: "svc-social-graph", kind: "dependsOn", label: "follow/unfollow/list" },
  { from: "svc-social-graph", to: "db-listener-follows", kind: "flowsTo", label: "persist follow edges" },
  { from: "db-listener-follows", to: "db-users", kind: "dependsOn", label: "follower/followee (cascade)" },
  { from: "svc-social-graph", to: "db-listener-prefs", kind: "dependsOn", label: "activity-sharing opt-in gate" },
  { from: "api-circle-activity", to: "svc-social-activity", kind: "dependsOn", label: "your-people going/firing" },
  { from: "api-circle-share", to: "svc-social-activity", kind: "dependsOn", label: "share with circle" },
  { from: "svc-social-activity", to: "db-listener-follows", kind: "dependsOn", label: "follow edges (gate)" },
  { from: "svc-social-activity", to: "db-person-event-state", kind: "dependsOn", label: "going/firing source" },
  { from: "svc-social-activity", to: "db-shared-songs", kind: "dependsOn", label: "seeder attribution (gated)" },
  { from: "svc-social-activity", to: "ui-eventboard", kind: "flowsTo", label: "circle badge (signed-in)" },
  { from: "svc-social-activity", to: "ui-event-detail", kind: "flowsTo", label: "people-you-follow strip + attribution" },
  { from: "api-curators", to: "svc-curators", kind: "dependsOn", label: "directory + profile" },
  { from: "api-me-curator-application", to: "svc-curators", kind: "dependsOn", label: "apply + my status (self-serve)" },
  { from: "api-me-curator", to: "svc-curators", kind: "dependsOn", label: "self-manage persona + picks" },
  { from: "api-admin-curators", to: "svc-curators", kind: "dependsOn", label: "promote/hide + picks + review queue" },
  { from: "svc-curators", to: "db-curators", kind: "flowsTo", label: "persona persistence" },
  { from: "svc-curators", to: "db-curator-picks", kind: "flowsTo", label: "per-show picks" },
  { from: "db-curators", to: "db-users", kind: "dependsOn", label: "persona over a user (cascade)" },
  { from: "svc-curators", to: "ui-curator-profile", kind: "flowsTo", label: "profile + top-list + picks" },
  { from: "svc-curators", to: "ui-eventboard", kind: "flowsTo", label: "curated-by board signal" },
  { from: "svc-curators", to: "ui-event-detail", kind: "flowsTo", label: "curated-by detail signal" },
  { from: "ui-curator-profile", to: "api-follows", kind: "flowsTo", label: "follow a curator (C1 edge)" },
  { from: "ui-eventboard", to: "ui-listener-profile", kind: "flowsTo", label: "sign-in entry" },

  // Operations
  { from: "job-cleanup", to: "int-blob", kind: "flowsTo", label: "delete stale images" },
  { from: "job-avlgo-sync", to: "db-job-runs", kind: "flowsTo", label: "records outcome" },
  { from: "job-cleanup", to: "db-job-runs", kind: "flowsTo", label: "records outcome" },
  { from: "int-umami", to: "ui-admin", kind: "flowsTo", label: "stats read back" },
  { from: "int-umami", to: "ui-homepage", kind: "dependsOn", label: "tracks usage" },
  { from: "svc-admin-data", to: "db-events", kind: "dependsOn", label: "reads counts" },
  { from: "svc-admin-data", to: "db-contributions", kind: "dependsOn", label: "reads counts" },
  { from: "svc-admin-data", to: "db-music-connections", kind: "dependsOn", label: "reads counts" },
  { from: "ui-admin", to: "svc-admin-data", kind: "dependsOn" },
  { from: "ui-admin", to: "svc-registry", kind: "dependsOn", label: "renders graph" },
  { from: "ui-admin", to: "db-admin-resources", kind: "flowsTo", label: "manages directory" },

  // Partners
  { from: "ui-eventboard", to: "partner-ryan-playlist", kind: "flowsTo", label: "features" },
  { from: "db-admin-resources", to: "partner-ryan-playlist", kind: "flowsTo", label: "catalogs" },
];

/* ------------------------------------------------------------------ */
/*  Public accessors (the ONLY way UI/export/tests read the model)     */
/* ------------------------------------------------------------------ */

/**
 * The canonical static registry. Returns fresh arrays so callers can safely sort/enrich without
 * mutating the module-level source of truth.
 */
export function getSystemRegistry(): SystemRegistry {
  return {
    nodes: NODES.map((node) => ({ ...node })),
    edges: EDGES.map((edge) => ({ ...edge })),
  };
}

export function getRegistryNode(id: string): RegistryNode | undefined {
  const node = NODES.find((candidate) => candidate.id === id);
  return node ? { ...node } : undefined;
}

/** Nodes grouped by layer, in canonical layer order, for the high-level view and markdown. */
export function getNodesByLayer(
  nodes: RegistryNode[] = NODES
): Array<{ id: SystemLayer; label: string; blurb: string; nodes: RegistryNode[] }> {
  return SYSTEM_LAYERS.map((layer) => ({
    ...layer,
    nodes: nodes.filter((node) => node.layer === layer.id),
  })).filter((group) => group.nodes.length > 0);
}

/** Immediate inbound and outbound edges for a node — the "connections" shown when it expands. */
export function getNodeEdges(
  id: string,
  edges: RegistryEdge[] = EDGES
): { inbound: RegistryEdge[]; outbound: RegistryEdge[] } {
  return {
    inbound: edges.filter((edge) => edge.to === id),
    outbound: edges.filter((edge) => edge.from === id),
  };
}
