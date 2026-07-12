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
  | "tester_requests"
  | "music_connections"
  | "music_profile_items"
  | "listener_discovery_preferences"
  | "spotify_event_match_corrections"
  | "system_job_runs"
  | "admin_resources"
  | "saved_items"
  | "event_shared_songs"
  | "event_artist_matches"
  | "event_artist_tracks"
  | "listener_follows"
  | "curators"
  | "curator_picks"
  | "curator_recommendations"
  | "feedback";

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
  /**
   * Optional micro-level implementation details surfaced in the Admin Architecture hover tooltip
   * (and the generated map / JSON export). For SQL fallbacks, query parameter mappings, and driver
   * quirks a maintainer/agent would otherwise have to read the backing code to discover. Free-text
   * and descriptive — NOT drift-validated against code, so keep notes accurate by convention.
   */
  implementationNotes?: ImplementationNote[];
};

/**
 * Category of a low-level implementation note shown in the Admin Architecture hover tooltip.
 * Mirrors the kinds of micro-detail a maintainer/agent would otherwise have to read code to find.
 */
export type ImplementationNoteKind =
  | "sql_fallback" // a degrade-gracefully query path (e.g. a missing-column fallback)
  | "param_mapping" // what the query parameters / bound values actually map to
  | "runtime_gotcha" // a driver/runtime quirk (e.g. Postgres uninferable type on a null)
  | "note"; // any other implementation detail worth surfacing

export type ImplementationNote = {
  kind: ImplementationNoteKind;
  /** One concrete, plain-language detail. Keep to a single sentence. */
  detail: string;
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

export const IMPLEMENTATION_NOTE_KIND_LABELS: Record<ImplementationNoteKind, string> = {
  sql_fallback: "SQL fallback",
  param_mapping: "Param mapping",
  runtime_gotcha: "Runtime gotcha",
  note: "Note",
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
    implementationNotes: [
      {
        kind: "sql_fallback",
        detail:
          "On a non-OK response or any fetch/parse error the loader returns hardcoded seed events with shouldPersist=false, so the board never renders empty and a bad fetch never overwrites stored rows.",
      },
      {
        kind: "note",
        detail:
          "Tolerates three payload shapes — a top-level array, { events: [] }, or { data: [] }.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Hardcoded in lib/events.ts; used only when the live feed is unreachable and never persisted (shouldPersist=false).",
      },
    ],
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
    implementationNotes: [
      {
        kind: "param_mapping",
        detail:
          "Requests only read scopes (user-read-private, user-read-email, user-top-read); no write/library scope is requested.",
      },
      {
        kind: "runtime_gotcha",
        detail:
          "OAuth tokens stay server-side in the Auth.js accounts row and are never read by discovery scoring or exposed in any response.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Only a successful, non-empty fetch triggers upsertEvents; a failed fetch returns seed events without persisting.",
      },
      {
        kind: "sql_fallback",
        detail:
          "upsertEvents writes in batches (EVENT_UPSERT_BATCH_SIZE) with `on conflict (id) do update`, so the daily re-ingest updates rows in place rather than duplicating.",
      },
      {
        kind: "note",
        detail:
          "Read path is cached (PRD 51): getUpcomingEvents/getEventById run through unstable_cache under the `events` tag (wiring in lib/event-read-cache.ts, day-keyed with an in-memory started-events filter so output matches the uncached query). The AVLgo cron revalidates the tag after a successful upsert; public per-event signal maps (lib/board-data.ts, tag `event-signals`) are revalidated by community/curator/shared-song writes via lib/event-signals-cache.ts. test:events-cache guards once-per-key, tag invalidation, and the freshness contract.",
      },
    ],
  },
  {
    id: "svc-event-dedupe",
    kind: "service",
    layer: "processing",
    label: "Deduplication",
    description:
      "Groups near-identical events with fuzzy time bucketing — start times within FUZZY_START_WINDOW_MINUTES (90) of a cluster's earliest member merge — and picks a canonical record, hiding the rest. Surfaces the audit in the admin Gaps tab.",
    sourceOfTruth: "lib/event-dedupe.ts",
    access: "internal",
    ownership: "automated",
    implementationNotes: [
      {
        kind: "param_mapping",
        detail:
          "The grouping key is normalizeVenueKey(venue) + normalizeTitleCore(title) — article/plural-stripped word tokens — not the raw strings, so 'The Orange Peel' and 'Orange Peel' collapse.",
      },
      {
        kind: "note",
        detail:
          "getCanonicalEvents picks one winner per normalized (venue, title-core, date) signature — clustering start times within a 90-minute fuzzy window so cross-source doors-vs-showtime copies collapse — and hides the rest; the audit feeds the admin Gaps tab.",
      },
    ],
  },
  {
    id: "svc-write-rate-limit",
    kind: "service",
    layer: "processing",
    label: "Write Rate Limiter",
    description:
      "Shared sliding-window rate limiting for every public write route (PRD 52 / ADR 003 §4): feedback, reactions, contributions, ticket intents, discovery event actions, Spotify match corrections, and avatar uploads each gate on an IP dimension plus an optional identity dimension (session/user id) before parsing the body — the Nth write in the window is a 429. Also owns the shared getClientIp helper and the `website` honeypot check.",
    sourceOfTruth: "lib/write-rate-limit.ts",
    access: "internal",
    ownership: "automated",
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Deliberately in-memory per warm instance (ADR 003 amendment 4 accepted limitation): free and dependency-less, effective under Fluid Compute instance reuse; the Vercel WAF rules are the cross-instance backstop and a KV-backed limiter is the escape hatch only if multi-instance accuracy becomes a measured problem. Windows reuse the pure helpers in lib/tester-requests-core.ts; the IP dimension on contributions is the cookie-clear fix (the session-keyed DB check in lib/community.ts stays). test:write-rate-limits guards the window math and source-scans the route wiring.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "sql_fallback",
        detail:
          "listMusicConnections / listMusicProfileItems retry a legacy query when the optional taste_opt_out_at / genres columns are absent (runWithMissingColumnFallback).",
      },
      {
        kind: "runtime_gotcha",
        detail:
          "The legacy fallbacks substitute explicitly-typed placeholders (null::timestamptz, '{}'::text[]) because Postgres can't infer a bare null/array's type in the select list.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "sql_fallback",
        detail:
          "Every read is 42P01 (undefined_table) tolerant and degrades to empty, so the public board survives a not-yet-migrated DB.",
      },
      {
        kind: "param_mapping",
        detail:
          "Batch reads bind $1::text[] of event ids; the single-event filter uses `$1::text is null or event_id = $1`.",
      },
      {
        kind: "note",
        detail:
          "Seeding upserts `on conflict (event_id, provider, provider_track_id) do update` (dedup per track) and is best-effort, so a Spotify failure never breaks the reaction.",
      },
    ],
  },
  {
    id: "svc-artist-match",
    kind: "service",
    layer: "processing",
    label: "Artist Matcher",
    description:
      "Resolves an event's artist_name to a Spotify artist with an app-only (Client Credentials) token — no user, no allowlist seat, no new scopes. Only exact-normalized name matches auto-publish an embed; fuzzy matches are held in needs_review (a wrong artist is worse than none). Caches per normalized name so repeat artists never re-hit the API, and caches the matched artist's top tracks for the board hover player. Runs on the ingestion hook and the backfill route.",
    sourceOfTruth: "lib/artist-match.ts",
    access: "internal",
    ownership: "automated",
    envVars: ["AUTH_SPOTIFY_ID", "AUTH_SPOTIFY_SECRET"],
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Pure matching core (normalization, exact-vs-fuzzy, base62 id sink guard) lives in lib/artist-match-core.ts and is shared with the PRD 17 user-token path.",
      },
      {
        kind: "sql_fallback",
        detail:
          "Every read/write is 42P01 (undefined_table) tolerant and degrades to empty, so the embed and board survive a not-yet-migrated DB and matching never breaks event ingestion.",
      },
      {
        kind: "runtime_gotcha",
        detail:
          "Backfill backs off on a Spotify 429/5xx and persists partial progress; events with a row are skipped so re-runs are no-ops (matches are stable).",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Pure (no DB); SCORER_VERSION ('12.4') versions ranking output for the Insight baseline. Best partial match wins across the artist/venue/genre taste maps.",
      },
      {
        kind: "runtime_gotcha",
        detail:
          "Anonymous (and dial-0) callers get socialCircle = 0, keeping the anonymous board byte-for-byte unchanged.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "param_mapping",
        detail:
          "Signal reads bind $1::text[] identity keys and a window via make_interval(days => $2::int); the implicit-signal window is 90 days.",
      },
      {
        kind: "runtime_gotcha",
        detail:
          "Per-dimension unions use explicit casts ('artist'::text as dimension) and tags are unnested via unnest(coalesce(tags, '{}'::text[])) to avoid null-array errors.",
      },
      {
        kind: "note",
        detail:
          "migrateSessionSignalsToUser re-keys a browser's anonymous rows to the user inside a transaction; per-event state (unique (event_id, identity_key)) merges with GREATEST timestamps; a second run is a no-op.",
      },
      {
        kind: "note",
        detail:
          "writePersonEventState has toggle semantics: it reads the merged current state once, then writes the same explicit next value (fire_at / planning_at set or cleared) to every identity row, so a signed-in user's user: and session: rows can never desync into a stuck ON.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "runtime_gotcha",
        detail:
          "Count rollups use `count(*) filter (where ...)::int`; a legacy fallback synthesizes the going/fire/source columns when the newer source column is absent.",
      },
      {
        kind: "note",
        detail:
          "Reactions/intents upsert `on conflict (event_id, identity_key) do update`; user_id is nullable so anonymous participation works. Reactions and Going intents are true toggles: toggleReaction takes an explicit on direction (off deletes the caller's reaction) and removeEventIntent deletes a Going intent — deletes match by session and, for signed-in users, any rows under their user id; external intent sources (spotify / ticket_click) stay set-once.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Pure preference model — nine weighted 0–200 controls (weight 0 fully cancels a dimension) plus ad-hoc custom boost/lower signals; persisted as weights jsonb / custom_signals jsonb.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Pure and client-safe (no server-only import): 20 canonical genres + an alias/synonym map that resolves alias tags (rnb→soul, singer-songwriter→folk) and symmetric parent/child links.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "param_mapping",
        detail:
          "For venues/artists (no entity table) item_key = normalizeText(name) — the same normalization discovery scoring uses — so a saved venue/artist matches scoring identity.",
      },
      {
        kind: "sql_fallback",
        detail:
          "Reads are 42P01-tolerant and degrade to empty.",
      },
      {
        kind: "note",
        detail:
          "saveItem is idempotent via `on conflict (user_id, item_type, item_key) do nothing`.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "sql_fallback",
        detail:
          "Reads tolerate both 42P01 (missing table) and 42703 (missing column) and degrade to empty/false.",
      },
      {
        kind: "note",
        detail:
          "Follow writes upsert `on conflict (follower_user_id, followee_user_id) do nothing`; activity visibility is gated by coalesce(share_activity, false).",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "going/firing are derived in the SQL join (planning_at/fire_at present and not superseded by removed_at), gated by the active edge AND the followee's share_activity — so unfollowing or turning sharing off removes visibility instantly (no new table).",
      },
      {
        kind: "runtime_gotcha",
        detail:
          "Reads tolerate 42P01/42703; seeded_by_user_id is resolved to a name server-side and never shipped raw.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "curator_picks carry NO FK to events (daily re-ingest would cascade-delete them): event_title is snapshotted and live metadata is resolved via `left join public.events`.",
      },
      {
        kind: "param_mapping",
        detail:
          "The board signal binds $1::text[] event ids and filters status='visible'; promote upserts `on conflict (user_id) do update`.",
      },
      {
        kind: "sql_fallback",
        detail:
          "Reads tolerate 42P01 and degrade to empty.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "param_mapping",
        detail:
          "The window read (listUpcomingEventsFromDatabase) binds $1/$2 = rolling-window start/end as YYYY-MM-DD and $3 = now as ISO.",
      },
      {
        kind: "note",
        detail:
          "Rows order by coalesce(starts_at, event_date::timestamp + 23:59) so date-only events sort to the end of their day.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Append-only; written by the sync routes via recordJobRun (a start row, then a finish/failure row) and read by the cron health probes.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "param_mapping",
        detail:
          "The live count excludes archived rows (`where status <> 'archived'`); admin-managed via the Stewardship tab.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Nullable user_id (anonymous-first); voice rows exist in the schema but are excluded from the launch surface. Public reads never expose session_id/user_id.",
      },
    ],
  },
  {
    id: "db-feedback",
    kind: "datastore",
    layer: "data",
    label: "feedback",
    description:
      "Listener feedback (notes from the 404 detour + general). Anonymous-friendly capture: message, optional email, the path they came from, and the submitter's user id when signed in. Private to the admin; never surfaced publicly.",
    sourceOfTruth: "feedback",
    access: "internal",
    ownership: "automated",
    countKey: "feedback",
    implementationNotes: [
      {
        kind: "sql_fallback",
        detail:
          "POST /api/feedback submit is 42P01-tolerant — a not-yet-provisioned table degrades to a friendly success rather than a 500, so the 404-detour form never errors.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "runtime_gotcha",
        detail:
          "A legacy read fallback synthesizes going/fire from the `type` column when the newer `source` column is absent (see lib/community.ts).",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Going/ticket-click intents per identity_key, tagged by source (avlmc / spotify / ticket_click); the rollup splits each source via `count(*) filter (...)::int`.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "param_mapping",
        detail:
          "Window reads bind $1::text[] identity keys + make_interval(days => $2::int).",
      },
      {
        kind: "note",
        detail:
          "Append-only, keyed by identity_key; the 90-day impression window drives implicit 'skip' cooling, so any prune job must not delete rows inside that window.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "unique (event_id, identity_key); on the anonymous→account hand-off, rows are merged with GREATEST timestamps so the strongest/most-recent state wins.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Auth.js user record; users.email is demoted to primary/display — multi-email resolution lives in user_emails (PRD 35).",
      },
    ],
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
    implementationNotes: [
      {
        kind: "runtime_gotcha",
        detail:
          "Provider OAuth access/refresh tokens live here and are read server-side only; never surfaced to the admin portal, the API, or this registry.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "param_mapping",
        detail:
          "Global unique(lower(email)); inserts guard with `where not exists (select 1 ... where lower(email)=lower($2))`, and resolution matches `lower(email)=lower($1)`.",
      },
      {
        kind: "sql_fallback",
        detail:
          "record/find are 42P01/42703-tolerant so a multi-email write never blocks sign-in.",
      },
    ],
  },
  {
    id: "db-spotify-access-requests",
    kind: "datastore",
    layer: "data",
    label: "spotify_access_requests",
    description:
      "Spotify tester-slot access requests (PRD 36): a not-yet-approved listener's Spotify email + status (pending/slot_added/approved/rejected) while Spotify is in Development Mode (owner + up to 5 users). One open request per user; the slot add is an external dashboard action this only tracks. The Spotify email is private to listener + admin — never exposed publicly.",
    sourceOfTruth: "spotify_access_requests",
    access: "internal",
    ownership: "automated",
    countKey: "spotify_access_requests",
    implementationNotes: [
      {
        kind: "note",
        detail:
          "A partial unique index (spotify_access_requests_one_open_idx) enforces one OPEN request per user; status lifecycle is pending → slot_added → approved/rejected.",
      },
    ],
  },
  {
    id: "db-tester-requests",
    kind: "datastore",
    layer: "data",
    label: "tester_requests",
    description:
      "Anonymous Spotify tester interest (PRD 42 / Phase 17): email-keyed, pre-redirect capture of would-be testers — applicants usually have no account yet; convergence happens when they sign in with the same email. One row per email (upsert-on-reapply, status never demoted); lifecycle pending → approved (owner allowlisted in the Spotify dashboard) → invited (invite email sent), or declined (can re-apply without re-notifying). Emails private to applicant + owner.",
    sourceOfTruth: "tester_requests",
    access: "internal",
    ownership: "automated",
    countKey: "tester_requests",
    implementationNotes: [
      {
        kind: "note",
        detail:
          "UNIQUE(email), stored lowercased/trimmed; `(xmax = 0)` on the upsert distinguishes a fresh insert (notify the owner) from a re-apply (silent). The seated count spans this table AND spotify_access_requests as distinct emails.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "sql_fallback",
        detail:
          "listMusicConnections retries with a legacy query when the taste_opt_out_at column is absent, selecting null::timestamptz as taste_opt_out_at instead.",
      },
      {
        kind: "runtime_gotcha",
        detail:
          "The fallback casts the bare null (null::timestamptz) because Postgres cannot infer a column type from an untyped null in the select list.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "sql_fallback",
        detail:
          "listMusicProfileItems (runWithMissingColumnFallback) selects the genres column, then retries substituting '{}'::text[] as genres when the additive PRD-16 column has not been applied yet.",
      },
      {
        kind: "runtime_gotcha",
        detail:
          "The empty-array fallback is explicitly typed ('{}'::text[]) so the driver maps it to string[] exactly like the real column.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "weights jsonb + custom_signals jsonb; one row per signed-in listener (anonymous prefs live in localStorage).",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Per-person reject/replace corrections consumed by discovery, so a rejected match no longer boosts and a replacement does.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "param_mapping",
        detail:
          "item_key for venues/artists = normalizeText(name) (shared with discovery identity); idempotent insert `on conflict (user_id, item_type, item_key) do nothing`.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "One-way reversible edge; unfollowing deletes the row (on delete cascade). The live count filters status='active'.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "status includes pending/rejected for Phase 13 self-serve onboarding; handle is URL-safe + unique; promote upserts `on conflict (user_id) do update`.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "No FK to events (daily re-ingest would cascade-delete): event_title is snapshotted and live metadata resolved via a tolerant left join; the live count filters status='visible'.",
      },
    ],
  },
  {
    id: "db-curator-recommendations",
    kind: "datastore",
    layer: "data",
    label: "curator_recommendations",
    description:
      "Listener nominations of someone who should curate ('I know someone') — distinct from a self-serve application where the user applies as themselves. The nominee is free text (no FK; they may not be a user yet); only the submitter is a real user. Private to submitter + admin (never public, no pay-to-play); the admin works the pending → reviewed/dismissed queue.",
    sourceOfTruth: "curator_recommendations",
    access: "internal",
    ownership: "automated",
    countKey: "curator_recommendations",
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Signed-in-only submit (the user id comes from the session, never the body); 42P01/42703-tolerant reads. Lifecycle pending → reviewed/dismissed (both stamp resolved_at).",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Upsert dedups per track via `on conflict (event_id, provider, provider_track_id)`; the live count filters status='visible'.",
      },
      {
        kind: "runtime_gotcha",
        detail:
          "seeded_by_user_id is stored server-side only (the inner-circle attribution on-ramp) and never appears in the anonymous/public payload.",
      },
    ],
  },
  {
    id: "db-event-artist-matches",
    kind: "datastore",
    layer: "data",
    label: "event_artist_matches",
    description:
      "One resolved Spotify artist per event (PRD 46). Only auto/confirmed/replaced statuses publish an embed; needs_review holds fuzzy matches out of sight; rejected tombstones a no-hit. Indexed on normalized_name so repeat artists resolve from cache. Outside discovery scoring.",
    sourceOfTruth: "event_artist_matches",
    access: "public",
    ownership: "hybrid",
    countKey: "event_artist_matches",
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Unique (event_id, provider); the live count is all rows. The embed sink re-validates spotify_artist_id as base62 before building the iframe URL.",
      },
    ],
  },
  {
    id: "db-event-artist-tracks",
    kind: "datastore",
    layer: "data",
    label: "event_artist_tracks",
    description:
      "Cached top tracks for a matched artist (PRD 46), powering the board hover-play playlist and a track-list fallback. Sibling of event_shared_songs so it never touches the PRD 17 community list or discovery scoring.",
    sourceOfTruth: "event_artist_tracks",
    access: "public",
    ownership: "automated",
    countKey: "event_artist_tracks",
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Only auto/confirmed/replaced (published) matches get tracks written; upsert dedups per track via `on conflict (event_id, provider, provider_track_id)`.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Server component that resolves the anonymous session cookie and renders the ranked board; fully usable without an account.",
      },
    ],
  },
  {
    id: "ui-eventboard",
    kind: "surface",
    layer: "experience",
    label: "Event Board",
    description: "Card grid of events with shareable URL-backed filters, custom date ranges, reactions, community, and discovery ordering.",
    sourceOfTruth: "components/EventBoard.tsx",
    access: "public",
    ownership: "automated",
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Filters are URL-backed (deep-linkable); the client re-scores instantly on a local preference/signal change via LISTENER_PREFERENCE_CHANGE_EVENT without a page reload.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Server-rendered per-event page that also generates OG/share metadata; resilient if community / shared-song data can't load.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "runtime_gotcha",
        detail:
          "Snyk flags a DOM-based XSS dataflow here (a useState value flowing into a rendered sink, ~line 567) — a tracked, pre-existing finding to harden.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "param_mapping",
        detail:
          "Body parsed as Record<string, unknown> and validated in lib/community.ts; identity_key comes from the session or the anonymous session cookie, never raw client input.",
      },
    ],
  },
  {
    id: "api-feedback",
    kind: "surface",
    layer: "community",
    label: "Feedback API",
    description:
      "Public (anonymous-friendly) feedback write, used by the 404 detour and general feedback. Stores a short note + optional email + originating path; attaches the user id from the session when signed in, never from the body. Resilient — degrades gracefully if the table isn't provisioned. Feedback is private to the admin.",
    sourceOfTruth: "app/api/feedback/route.ts",
    access: "public",
    ownership: "automated",
    implementationNotes: [
      {
        kind: "param_mapping",
        detail:
          "Body parsed with `.catch(() => null)`; the user id is taken from the session when signed in, never from the body.",
      },
      {
        kind: "sql_fallback",
        detail:
          "Tolerates a not-yet-provisioned table (returns a friendly success); only an unexpected error returns 500.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "runtime_gotcha",
        detail:
          "Body parsed with `.catch(() => null)`; DB failures strictly return 500 (no silent success) so a corrupt learning signal can't be written.",
      },
    ],
  },

  /* ---- Identity & taste ------------------------------------------ */
  {
    id: "int-authjs",
    kind: "integration",
    layer: "identity",
    label: "Auth.js",
    description:
      "Optional sign-in backed by the Postgres adapter: email magic link (Resend, branded dark-mode email — lib/auth-email.ts) plus optional Spotify OAuth. One identity per person (PRD 44): the Spotify provider sets allowDangerousEmailAccountLinking — safe because BOTH doors verify email ownership — so matching emails converge on one account automatically; custom pages.signIn (/auth/signin, PRD 43) and pages.error keep every funnel state on product surfaces.",
    sourceOfTruth: "auth.ts",
    access: "internal",
    ownership: "automated",
    envVars: ["NEXT_PUBLIC_AUTH_ENABLED", "AUTH_SECRET"],
    healthProbeId: "auth-provider",
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Postgres adapter + database session strategy; the events.signIn body lives in lib/auth-signin-event.ts (handleSignInEvent) and runs four best-effort steps — record music connection, refresh avatar, record provider email into user_emails, and migrate anonymous session signals — each through runBestEffort.",
      },
      {
        kind: "runtime_gotcha",
        detail:
          "events.signIn is AWAITED inside the @auth/core callback (callback/index.js), so a throw aborts the response after the session row is created but before the cookie is set — stranding a valid sign-in on /auth/error (audit F2). Every step MUST be best-effort: handleSignInEvent (lib/auth-signin-event.ts) wraps all four in runBestEffort, which logs a stable 'signIn side-effect failed:' prefix and never throws. Never add a bare await side effect to the event. Proven by tests/signin-event.test.ts (a throwing recordMusicConnection still completes sign-in).",
      },
      {
        kind: "runtime_gotcha",
        detail:
          "getUserByEmail is wrapped (lib/auth-adapter.ts) for multi-email resolution, and the Spotify provider auto-links on a verified email match (PRD 44 — convergence proven in tests/one-identity.integration.mts). OAuthAccountNotLinked remains only for genuine edges (email mismatch), mapped to the duplicate_account recovery copy. Any NEW provider must re-justify the auto-link flag explicitly.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Auth.js catch-all route handler ([...nextauth]) for sign-in / callback / session; no custom logic beyond the auth.ts config.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Broadcasts preference changes via LISTENER_PREFERENCE_CHANGE_EVENT for instant re-ranking; the Spotify beta wall becomes Request-access → pending → retry (PRD 36).",
      },
    ],
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
    implementationNotes: [
      {
        kind: "param_mapping",
        detail:
          "Signed-out returns authenticated:false plus enabled feature flags (never tokens); signed-in returns identity + connection metadata with token values stripped.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "param_mapping",
        detail:
          "Gated by requireUserId() (401 when anonymous); the acting user id comes from the session, never the body; body parsed with `.catch(() => null)`.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "param_mapping",
        detail:
          "Gated by requireUserId() (401 when anonymous); the follower id is the session user, never the body; body parsed with `.catch(() => null)`.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "param_mapping",
        detail:
          "Gated by requireUserId() (401/empty when anonymous); event ids bound as $2::text[], visibility resolved from the session user's circle — never anyone outside it.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Gated by requireUserId(); idempotent + best-effort, reuses existing going state (upsert with coalesce so an existing planning_at is kept), no Spotify write and no ranking change.",
      },
    ],
  },
  {
    id: "api-me-taste-import",
    kind: "surface",
    layer: "identity",
    label: "Taste Import API",
    description:
      "Signed-in-only, seat-free taste import (PRD 45): accepts an uploaded Spotify/Exportify playlist export CSV, parses the artists off the file, and stores them as top_artist music_profile_items feeding artistAffinity — no Spotify API call and no Development-Mode allowlist seat. Works for email-only accounts never allowlisted.",
    sourceOfTruth: "app/api/me/taste-import/route.ts",
    access: "public",
    ownership: "automated",
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Gated by requireUserId(); pure parsing in lib/taste-import-core.ts (semicolon multi-artist split, comma-split-by-URI for legacy exports, genre capture, frequency→rank); replaceImportedProfileItems (lib/music.ts) writes provider='spotify' top_artist rows under a dedicated time_range='import' so it never clobbers the OAuth /me/top medium_term sync.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "param_mapping",
        detail:
          "Gated by requireUserId() (401 when anonymous); resolves the id from the session, never the body; returns linked providers with tokens stripped + the account's emails.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "param_mapping",
        detail:
          "Gated by requireUserId(); the acting id is the session user, never the body. One open request per user (partial unique); the Spotify email is private to the listener + admin.",
      },
    ],
  },
  {
    id: "api-tester-requests",
    kind: "surface",
    layer: "identity",
    label: "Tester Request Capture API",
    description:
      "Public, anonymous-accessible Spotify tester request capture (PRD 42 / Phase 17) — the applicants we most want to catch have no account yet. POST { email, note?, source? } upserts one row per email (re-applying never duplicates, never demotes a status) and fires the owner-notification email exactly once per genuine new interest, after the response. Honeypot + per-IP/per-email sliding-window rate limit.",
    sourceOfTruth: "app/api/tester-requests/route.ts",
    access: "public",
    ownership: "automated",
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Anonymous by design; `website` honeypot mirrors the community form; rate windows are per-warm-instance (pure logic in lib/tester-requests-core.ts). Owner notification via sendAdminNotificationEmail (ADMIN_NOTIFY_EMAIL, falls back to AUTH_EMAIL_FROM) inside next/server `after()` — never blocks the applicant's confirmation.",
      },
    ],
  },
  {
    id: "ui-spotify-access-page",
    kind: "surface",
    layer: "identity",
    label: "Spotify Access Request Page",
    description:
      "Public /spotify-access page (PRD 42 / Phase 17): explains the invite-only Spotify beta in the product's voice, captures a tester request (email + optional taste note) through the capture API, and points at email sign-in as the always-works door. The landing spot for every 'Request Spotify access' affordance (the /auth/error beta notice; the PRD 43 sign-in chooser).",
    sourceOfTruth: "app/spotify-access/page.tsx",
    access: "public",
    ownership: "automated",
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Anonymous-accessible; a signed-in visitor's email pre-fills. Renders in the auth-recovery shell so the dark route tokens apply (PRD 39 discipline).",
      },
    ],
  },
  {
    id: "ui-privacy-page",
    kind: "surface",
    layer: "identity",
    label: "Privacy Policy Page",
    description:
      "Public /privacy page (PRD 45 / Phase 17): plain-language, code-verified statement of data practices — email for magic links, read-only Spotify scopes with server-side tokens (PRD 27 leak-audit posture), per-listener activity rows, cookieless Umami analytics, no selling/ads/pay-to-play, contact + deletion path. A Spotify Extended Quota review prerequisite, linked from the site footer and /spotify-access. PRDs that change data practices must update it in the same cycle.",
    sourceOfTruth: "app/privacy/page.tsx",
    access: "public",
    ownership: "manual",
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Static server component in the auth-recovery shell; every claim maps to a code path (scopes in auth.ts, disconnect/removal in lib/music.ts, analytics in app/layout.tsx). Dated; footer-linked site-wide.",
      },
    ],
  },
  {
    id: "api-spotify-gate",
    kind: "surface",
    layer: "identity",
    label: "Spotify Gate API",
    description:
      "The pre-redirect gate (PRD 43 / Phase 17): Spotify Development Mode 403s non-allowlisted users on Spotify's own domain, so the check runs BEFORE signIn('spotify'). GET returns chooser config (flags only, no DB); POST checks a stated/session email against BOTH request stores (tester_requests + spotify_access_requests, most-permissive-wins) → allowed | pending | declined | not_found | email_required. SPOTIFY_OPEN_ACCESS=true short-circuits to allowed with no store read.",
    sourceOfTruth: "app/api/spotify-gate/route.ts",
    access: "public",
    ownership: "automated",
    envVars: ["SPOTIFY_OPEN_ACCESS"],
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Pure outcome matrix in lib/spotify-gate-core.ts (test:spotify-gate); reads via lib/spotify-gate.ts are 42P01-tolerant and degrade to the request path, never to an ungated redirect. Rate-limited per IP; outcomes reveal only beta-list membership.",
      },
    ],
  },
  {
    id: "ui-signin-chooser",
    kind: "surface",
    layer: "identity",
    label: "Sign-In Chooser",
    description:
      "The three-door sign-in chooser (PRD 43 / Phase 17): Continue with Spotify (gated), sign in with email (always present), Request Spotify access (hidden under SPOTIFY_OPEN_ACCESS). One component, two shells — the in-page modal for action nudges and the custom pages.signIn full page (/auth/signin), so no funnel state shows NextAuth's unstyled default. The ONLY module allowed to call signIn('spotify') — guard-tested.",
    sourceOfTruth: "components/SignInChooser.tsx",
    access: "public",
    ownership: "automated",
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Call sites route through useSignInChooser (modal) or SpotifyGateButton (Spotify-specific spots): SaveButton, FollowButton, EventBoard nudge, EmailSignInPanel, ListenerProfileButton, CuratorManagePanel, AuthRecovery retry, SpotifyAccessRequest retry, MusicAccountPanel. Each preserves its original callbackUrl (e.g. the EventBoard keep-intent param); an anonymous allowed email is remembered client-side so the one-field step happens once per browser.",
      },
    ],
  },
  {
    id: "api-admin-tester-requests",
    kind: "surface",
    layer: "operations",
    label: "Admin Tester Requests API",
    description:
      "Admin-cookie-gated review of the anonymous tester-request queue (PRD 42 / Phase 17): list with the seat budget (distinct seated emails across both request stores vs. Spotify's owner + 5-user Development Mode cap), approve (sends the 'you're in' invite email; approved → invited once it sends), decline, re-open. Approval order is enforced by panel copy: allowlist in the Spotify dashboard FIRST.",
    sourceOfTruth: "app/api/admin/tester-requests/route.ts",
    access: "internal",
    ownership: "automated",
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Admin-cookie-gated (ADMIN_SESSION_TOKEN). A failed invite send keeps the row `approved` (never rolls back) and the panel offers a resend; actions are verbs (approve/decline/reopen) so the email side effect stays server-side.",
      },
    ],
  },
  {
    id: "api-admin-spotify-access",
    kind: "surface",
    layer: "operations",
    label: "Admin Spotify Access API",
    description:
      "Admin-cookie-gated Spotify tester-slot review (PRD 36): list the open request queue with each listener's Spotify email and mark slot_added/approved/rejected after adding them in the Spotify Developer Dashboard (owner + up to 5 users / Extended Quota). The slot add is an external action this only tracks. Admin-only — no self-serve.",
    sourceOfTruth: "app/api/admin/spotify-access/route.ts",
    access: "internal",
    ownership: "automated",
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Admin-cookie-gated (ADMIN_SESSION_TOKEN); the actual seat add (owner + up to 5) is an external Spotify Dashboard action this only tracks (status → slot_added/approved/rejected). No self-serve.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Gated by requireUserId(); promoted instantly under the isSelfServeOpen gate (CURATOR_SELF_SERVE_GATE = 25 curators / 250 users), else `pending`. The acting id is the session user, never the body.",
      },
    ],
  },
  {
    id: "api-me-curator-recommendation",
    kind: "surface",
    layer: "identity",
    label: "Curator Recommendation API",
    description:
      "Signed-in-only listener plane: nominate someone who should curate (free-text nominee + optional link/why). Distinct from the application API — here a listener recommends someone ELSE. The submitter id comes from the session, never the body; recommendations are private to submitter + admin (never public, no pay-to-play). Best-effort Resend admin notification on submit (never blocks the write). Returns 401 when anonymous.",
    sourceOfTruth: "app/api/me/curator-recommendation/route.ts",
    access: "public",
    ownership: "automated",
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Gated by requireUserId(); the submitter id is the session user, never the body. Pure validation in lib/curator-recommendations-core.ts; the admin email (ADMIN_NOTIFY_EMAIL, falls back to AUTH_EMAIL_FROM) is fired best-effort and wrapped so a Resend failure can't fail the submit.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Gated by requireUserId(); curator + pick ids are resolved from the session and re-checked in SQL ownership clauses, so a caller can never read or modify another curator. Admin moderation overrides.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Public read; returns active curators + visible picks only (never private going/firing, never a non-curator listener, never tokens/PII).",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Admin-cookie-gated (ADMIN_SESSION_TOKEN); promote/demote/hide + pick management. No self-serve, no pay-to-play.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Resolves the curator by URL-safe handle; renders persona + top-list + visible picks + a Follow button (C1 edge). Regular listeners never get a public profile.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Signed-in-only; anonymous visitors are redirected to sign-in with a return path. Renders three private lists (events/venues/artists) with inline un-save.",
      },
    ],
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
    envVars: ["CRON_SECRET"],
    healthProbeId: "cron-avlgo-sync",
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Scheduled 10:00 UTC; records a start + finish/failure row via recordJobRun. Supports an `?audit` query mode (searchParams) for a dry-run duplicate audit without persisting.",
      },
      {
        kind: "note",
        detail:
          "Bearer-gated (PRD 50): requires `Authorization: Bearer ${CRON_SECRET}` via assertCronRequest (lib/cron-auth.ts) — Vercel injects it on cron invocations; any other caller gets 401. Feed fetch is time-boxed (8s → seed fallback) and image ingest runs chunked (~6 concurrent).",
      },
    ],
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
    envVars: ["CRON_SECRET"],
    healthProbeId: "cron-cleanup",
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Scheduled 11:00 UTC; records the run via recordJobRun. A failure returns 500 with success:false rather than throwing.",
      },
      {
        kind: "note",
        detail:
          "Bearer-gated (PRD 50): requires `Authorization: Bearer ${CRON_SECRET}` via assertCronRequest (lib/cron-auth.ts); any other caller gets 401.",
      },
    ],
  },
  {
    id: "job-image-backfill",
    kind: "job",
    layer: "operations",
    label: "Hero Image Backfill (manual)",
    description:
      "Manual repair pass that re-ingests stored expiring Facebook CDN image URLs into Blob and clears dead ones to NULL (PRD 06).",
    sourceOfTruth: "app/api/sync/backfill-images/route.ts",
    access: "internal",
    ownership: "manual",
    envVars: ["CRON_SECRET"],
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Idempotent GET; scans rows with fbcdn image URLs, uploads still-live ones to Blob, nulls the rest so the initials fallback is intentional. Records the run via recordJobRun (job: image_backfill). Precedence rules live in lib/image-resilience.ts.",
      },
      {
        kind: "note",
        detail:
          "Bearer-gated (PRD 50): not in vercel.json's cron list — a manual re-trigger needs `curl -H \"Authorization: Bearer $CRON_SECRET\"`; unauthenticated callers get 401. Same gate covers /api/sync/artist-match.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "sql_fallback",
        detail:
          "Blob calls are wrapped in try/catch and degrade gracefully — a failed cache write or cleanup never breaks event rendering.",
      },
      {
        kind: "note",
        detail:
          "Ingest is bounded (PRD 50): 10s fetch timeout, content-type must be image/*, and the body is read under an 8 MB ceiling — pure guard logic in lib/image-ingest-guard.ts (test:blob-guard).",
      },
    ],
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
    implementationNotes: [
      {
        kind: "runtime_gotcha",
        detail:
          "The tracking script renders only when NEXT_PUBLIC_UMAMI_WEBSITE_ID is set; the admin read-back uses the server-only UMAMI_API_KEY (never client-exposed) and degrades to 'not configured' when absent.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "runtime_gotcha",
        detail:
          "Stewardship rollups bind window dates as $1::date and derive completeness via `count(*) filter (where ...)::int` (missing image/time, weak url, empty tags).",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Pure — no DB or server-only import — so the markdown generator and drift-guard test can run it without the app; each node's sourceOfTruth is drift-checked by test:registry.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "Gated by ADMIN_PASSWORD → an ADMIN_SESSION_TOKEN cookie; renders all admin tabs including this architecture graph.",
      },
    ],
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
    implementationNotes: [
      {
        kind: "note",
        detail:
          "A static external link rendered in the EventBoard nav (no data flow); the first ecosystem-partner slot.",
      },
    ],
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

  // Artist embed + board hover listening (PRD 46)
  { from: "int-spotify", to: "svc-artist-match", kind: "flowsTo", label: "app-token catalog reads" },
  { from: "svc-events", to: "svc-artist-match", kind: "flowsTo", label: "ingestion hook" },
  { from: "svc-artist-match", to: "db-event-artist-matches", kind: "flowsTo", label: "persist match" },
  { from: "svc-artist-match", to: "db-event-artist-tracks", kind: "flowsTo", label: "cache top tracks" },
  { from: "db-event-artist-matches", to: "ui-event-detail", kind: "flowsTo", label: "artist embed" },
  { from: "db-event-artist-tracks", to: "ui-eventboard", kind: "flowsTo", label: "hover playlist" },

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
  { from: "api-tester-requests", to: "db-tester-requests", kind: "dependsOn", label: "upsert + owner notification" },
  { from: "ui-spotify-access-page", to: "api-tester-requests", kind: "dependsOn", label: "request form submit" },
  { from: "api-admin-tester-requests", to: "db-tester-requests", kind: "dependsOn", label: "queue + approve/invite" },
  { from: "api-admin-tester-requests", to: "db-spotify-access-requests", kind: "dependsOn", label: "seat count spans both stores" },
  { from: "api-spotify-gate", to: "db-tester-requests", kind: "dependsOn", label: "seat check (email loop)" },
  { from: "api-spotify-gate", to: "db-spotify-access-requests", kind: "dependsOn", label: "seat check (signed-in loop)" },
  { from: "ui-signin-chooser", to: "api-spotify-gate", kind: "dependsOn", label: "pre-redirect gate + config" },
  { from: "ui-signin-chooser", to: "api-tester-requests", kind: "dependsOn", label: "inline request form" },
  { from: "ui-signin-chooser", to: "api-auth", kind: "dependsOn", label: "signIn (spotify/resend)" },
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
  { from: "api-me-curator-recommendation", to: "db-curator-recommendations", kind: "flowsTo", label: "stores recommendation" },
  { from: "api-admin-curators", to: "db-curator-recommendations", kind: "dependsOn", label: "recommendation review queue" },
  { from: "db-curator-recommendations", to: "db-users", kind: "dependsOn", label: "submitter (cascade)" },
  { from: "api-feedback", to: "db-feedback", kind: "flowsTo", label: "stores listener feedback" },
  { from: "db-feedback", to: "db-users", kind: "dependsOn", label: "optional submitter (set null)" },
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
  { from: "job-image-backfill", to: "int-blob", kind: "flowsTo", label: "re-ingest images" },
  { from: "job-image-backfill", to: "db-job-runs", kind: "flowsTo", label: "records outcome" },
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
