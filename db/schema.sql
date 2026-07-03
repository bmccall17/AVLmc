-- ============================================================
-- AVL Music Companion — canonical database schema (single source of truth).
--
-- This file is the ONE place the schema is defined. Every column that earlier
-- shipped as an incremental `ALTER TABLE ... ADD COLUMN` has been folded into its
-- `CREATE TABLE`; one-time data backfills have been removed (they live in version
-- history). Safe to run repeatedly: every statement is `IF NOT EXISTS`.
--
-- Hosting: Neon Postgres 17. Use the pooled (`-pooler`) connection string for the
-- app runtime (Vercel `DATABASE_URL`); use the direct endpoint for migrations/dumps.
-- ============================================================

-- ---- Events (re-ingested daily from AVLgo; the source of truth for listings) ----
create table if not exists public.events (
  id text primary key,
  avlgo_event_id text not null,
  artist_name text not null,
  event_title text not null,
  venue_name text not null,
  event_date date not null,
  event_time text,
  starts_at timestamptz,
  event_url text not null,
  image_url text,
  source text not null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_event_date_idx on public.events (event_date);
create index if not exists events_starts_at_idx on public.events (starts_at);

-- ---- Auth.js (NextAuth) identity tables ----------------------------------------
create table if not exists public.users (
  id serial primary key,
  name text,
  email text,
  "emailVerified" timestamptz,
  image text
);

create unique index if not exists users_email_idx on public.users (email);

create table if not exists public.accounts (
  id serial primary key,
  "userId" integer not null references public.users(id) on delete cascade,
  type text not null,
  provider text not null,
  "providerAccountId" text not null,
  refresh_token text,
  access_token text,
  expires_at bigint,
  token_type text,
  scope text,
  id_token text,
  session_state text
);

create unique index if not exists accounts_provider_provider_account_id_idx
  on public.accounts (provider, "providerAccountId");
create index if not exists accounts_user_id_idx on public.accounts ("userId");

create table if not exists public.sessions (
  id serial primary key,
  "userId" integer not null references public.users(id) on delete cascade,
  expires timestamptz not null,
  "sessionToken" text not null
);

create unique index if not exists sessions_session_token_idx
  on public.sessions ("sessionToken");
create index if not exists sessions_user_id_idx on public.sessions ("userId");

create table if not exists public.verification_token (
  identifier text not null,
  expires timestamptz not null,
  token text not null
);

create unique index if not exists verification_token_identifier_token_idx
  on public.verification_token (identifier, token);

-- ---- Account identity: multiple verified emails per account (PRD 35 / Phase 15) -------------
-- One human = one users row, but an account can own several emails: the magic-link email plus the
-- email each linked music platform (Spotify, …) returns. ANY recorded, verified email resolves to
-- the same users.id, so connecting a second sign-in method never forks into a duplicate account.
-- users.email stays as the primary/display value (Auth.js compatibility); user_emails is the real
-- identity key ("which account owns this email"). Additive + 42P01-tolerant.
create table if not exists public.user_emails (
  id serial primary key,
  user_id integer not null references public.users(id) on delete cascade,
  email text not null,
  -- provider-generic; only magic_link + spotify are wired in Phase 15 (others reserved for backlog).
  source text not null default 'magic_link'
    check (source in ('magic_link', 'spotify', 'google_youtube', 'apple_music')),
  verified boolean not null default false,
  is_primary boolean not null default false,
  added_at timestamptz not null default now()
);

-- Global: any email is owned by at most one account (case-insensitive) — prevents cross-account forks.
create unique index if not exists user_emails_email_lower_idx on public.user_emails (lower(email));
-- At most one primary email per account.
create unique index if not exists user_emails_one_primary_idx
  on public.user_emails (user_id) where is_primary;
create index if not exists user_emails_user_id_idx on public.user_emails (user_id);

-- Back-fill existing users' primary email as the first user_emails row. Idempotent (NOT EXISTS guard).
-- An already-authenticated email is verified; source is spotify when the user has a Spotify account,
-- else magic_link.
insert into public.user_emails (user_id, email, source, verified, is_primary)
select
  u.id,
  u.email,
  case
    when exists (select 1 from public.accounts a where a."userId" = u.id and a.provider = 'spotify')
      then 'spotify'
    else 'magic_link'
  end,
  true,
  true
from public.users u
where u.email is not null
  and not exists (
    select 1 from public.user_emails ue where lower(ue.email) = lower(u.email)
  );

-- ---- Spotify tester-slot access requests (PRD 36 / Phase 15) --------------------
-- While Spotify is in Development Mode (a hard 25-user allowlist), a not-yet-approved listener can
-- request access: we capture their Spotify account email + a status the admin works through. The
-- 25-slot add itself is an external Spotify Developer Dashboard action (User Management / Extended
-- Quota); this table only tracks the request so the admin sees who is waiting and the listener sees
-- honest "pending" / "added — retry now" status. The Spotify email is private to the listener +
-- admin (never public). Additive + 42P01-tolerant per db/schema.sql being the single source of truth.
create table if not exists public.spotify_access_requests (
  id serial primary key,
  user_id integer not null references public.users(id) on delete cascade,
  spotify_email text not null,
  status text not null default 'pending'
    check (status in ('pending', 'slot_added', 'approved', 'rejected')),
  note text,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- At most one OPEN request (pending or slot_added) per user — a retry edits the open row, never forks.
create unique index if not exists spotify_access_requests_one_open_idx
  on public.spotify_access_requests (user_id)
  where status in ('pending', 'slot_added');
create index if not exists spotify_access_requests_status_idx
  on public.spotify_access_requests (status);

-- ---- Anonymous Spotify tester requests (PRD 42 / Phase 17) ----------------------
-- Pre-redirect capture of Spotify interest, keyed by email — applicants usually have no account
-- yet; convergence happens naturally when they later sign in with the same email. Re-applying
-- upserts (never duplicates, never demotes a status). Lifecycle: pending → approved (owner
-- allowlisted the email in the Spotify dashboard) → invited (invite email sent); declined can
-- re-apply without re-notifying the owner.
create table if not exists public.tester_requests (
  id serial primary key,
  email text not null unique,
  note text,
  source text not null default 'direct',
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined', 'invited')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tester_requests_status_idx
  on public.tester_requests (status);

-- ---- Optional music identity / taste (Spotify) ---------------------------------
create table if not exists public.music_connections (
  id text primary key,
  user_id integer not null references public.users(id) on delete cascade,
  provider text not null check (provider in ('spotify', 'google_youtube', 'apple_music')),
  scopes text[] not null default '{}',
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  taste_opt_out_at timestamptz,
  disconnected_at timestamptz,
  unique (user_id, provider)
);

create index if not exists music_connections_user_id_idx
  on public.music_connections (user_id);

create table if not exists public.music_profile_items (
  id text primary key,
  user_id integer not null references public.users(id) on delete cascade,
  provider text not null check (provider in ('spotify', 'google_youtube', 'apple_music')),
  item_type text not null check (item_type in ('top_artist', 'top_track')),
  provider_item_id text not null,
  name text not null,
  artist_names text[] not null default '{}',
  genres text[] not null default '{}',
  external_url text,
  image_url text,
  rank integer not null,
  time_range text not null,
  synced_at timestamptz not null default now(),
  unique (user_id, provider, item_type, provider_item_id, time_range)
);

create index if not exists music_profile_items_user_provider_idx
  on public.music_profile_items (user_id, provider, item_type, rank);

create table if not exists public.listener_discovery_preferences (
  id text primary key,
  user_id integer not null references public.users(id) on delete cascade,
  weights jsonb not null default '{}'::jsonb,
  custom_signals jsonb not null default '[]'::jsonb,
  -- Social / Curator Graph (PRD 23 / C1): the single activity-sharing consent gate. Off by
  -- default. When false, the listener is absent from every "your people" read in later cycles.
  share_activity boolean not null default false,
  contribution_visibility text not null default 'anonymous' check (contribution_visibility in ('anonymous', 'followers', 'everyone')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

-- Additive column for databases provisioned before PRD 23. IF NOT EXISTS keeps schema.sql idempotent.
alter table public.listener_discovery_preferences
  add column if not exists share_activity boolean not null default false;

alter table public.listener_discovery_preferences
  add column if not exists contribution_visibility text not null default 'anonymous'
  check (contribution_visibility in ('anonymous', 'followers', 'everyone'));

create index if not exists listener_discovery_preferences_user_id_idx
  on public.listener_discovery_preferences (user_id);

-- ---- Social / Curator Graph (PRD 23 / C1): private, one-way, reversible follow edges. -------
-- A signed-in listener follows another listener (or, later, a curator). One row per direction;
-- unfollowing deletes the row. Never exposed in any public/community/OG response. Visibility of a
-- followee's activity is gated by this edge AND the followee's share_activity opt-in (see
-- lib/social-graph.ts canViewActivityOf). on delete cascade on both FKs keeps the graph clean.
create table if not exists public.listener_follows (
  id text primary key,
  follower_user_id integer not null references public.users(id) on delete cascade,
  followee_user_id integer not null references public.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'blocked')),
  created_at timestamptz not null default now(),
  unique (follower_user_id, followee_user_id),
  check (follower_user_id <> followee_user_id)
);

create index if not exists listener_follows_followee_idx
  on public.listener_follows (followee_user_id, status);

-- ---- Curator & Influencer Profiles (PRD 25 / C3; self-serve onboarding PRD 29 / Phase 13). ---
-- A curator is a public persona layered on an existing user (one row per user). Originally
-- admin-only; PRD 29 adds a self-serve lifecycle — a signed-in listener authors their own persona
-- and is promoted instantly under a gate or lands `pending` for admin review above it. Public reads
-- filter status='active', so pending/rejected rows are invisible by construction. No pay-to-play.
-- Following a curator reuses the listener_follows edge above — a curator is just a special followee.
create table if not exists public.curators (
  id text primary key,
  user_id integer not null unique references public.users(id) on delete cascade,
  handle text not null unique,
  display_name text not null,
  bio text,
  avatar_url text,
  -- application_note: the applicant's self-serve pitch (PRD 29). Private to applicant + admin.
  application_note text,
  status text not null default 'active' check (status in ('active', 'hidden', 'pending', 'rejected')),
  -- false for self-serve rows (PRD 29), true for admin promotions (PRD 25).
  promoted_by_admin boolean not null default true,
  -- handle_changed_at: rate-limits self-serve handle changes (PRD 33 anti-abuse).
  handle_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Additive changes for databases provisioned before PRD 29 / PRD 33. IF NOT EXISTS / drop+re-add
-- keep schema.sql idempotent (single source of truth; run it to provision or repair).
alter table public.curators
  add column if not exists application_note text;
alter table public.curators
  add column if not exists handle_changed_at timestamptz not null default now();
alter table public.curators
  drop constraint if exists curators_status_check;
alter table public.curators
  add constraint curators_status_check check (status in ('active', 'hidden', 'pending', 'rejected'));

create index if not exists curators_status_idx on public.curators (status);

-- A curator's deliberate, attributed per-show pick. Like contributions/person-event-state this
-- deliberately has NO FK to events (events are re-ingested daily and would cascade-delete picks);
-- it snapshots event_title and resolves live event metadata via a tolerant join at read time.
create table if not exists public.curator_picks (
  id text primary key,
  curator_id text not null references public.curators(id) on delete cascade,
  event_id text not null,
  event_title text not null default '',
  note text,
  status text not null default 'visible' check (status in ('visible', 'hidden')),
  created_at timestamptz not null default now(),
  unique (curator_id, event_id)
);

create index if not exists curator_picks_event_status_idx
  on public.curator_picks (event_id, status);
create index if not exists curator_picks_curator_idx
  on public.curator_picks (curator_id, status);

-- "Recommend a curator" intake (parked backlog item, Reported Jun 18, 2026). A signed-in listener
-- nominates someone who should curate ("I know someone who should") — distinct from a self-serve
-- application (curators table) where the user applies as themselves. The nominee is free text (they
-- may not be a user yet), so there is no FK to the nominee; only the submitter is a real user.
-- Private to submitter + admin (never public, no pay-to-play). The admin works the pending queue.
-- Additive + 42P01-tolerant per db/schema.sql being the single source of truth.
create table if not exists public.curator_recommendations (
  id text primary key,
  user_id integer not null references public.users(id) on delete cascade,
  nominee_name text not null,
  nominee_link text,
  reason text,
  status text not null default 'pending'
    check (status in ('pending', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists curator_recommendations_status_idx
  on public.curator_recommendations (status);

-- ---- Community contributions & reactions ---------------------------------------
-- Interaction tables keep their own copy of event metadata (event_title, etc.) and
-- deliberately have NO FK to events: events are re-ingested daily from AVLgo, so the
-- human/community layer must survive a refresh that rewrites the events table.
create table if not exists public.contributions (
  id text primary key,
  event_id text not null,
  event_title text not null,
  type text not null check (type in ('song', 'comment', 'voice')),
  display_name text,
  body_text text,
  song_title text,
  song_artist text,
  song_url text,
  music_provider text,
  music_provider_item_id text,
  music_provider_url text,
  audio_url text,
  duration_seconds integer,
  session_id text not null,
  user_id integer references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'visible' check (status in ('visible', 'hidden', 'pending'))
);

alter table public.contributions
  add column if not exists updated_at timestamptz not null default now();

create index if not exists contributions_event_id_status_idx
  on public.contributions (event_id, status, created_at desc);
create index if not exists contributions_session_created_at_idx
  on public.contributions (session_id, created_at desc);
create index if not exists contributions_user_id_idx
  on public.contributions (user_id);

-- "fire" reactions live here; "going" intent lives in event_intents (below).
create table if not exists public.reactions (
  id text primary key,
  event_id text not null,
  event_title text not null,
  type text not null check (type in ('going', 'fire')),
  session_id text not null,
  user_id integer references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (event_id, type, session_id)
);

create index if not exists reactions_event_id_idx on public.reactions (event_id);
create index if not exists reactions_user_id_idx on public.reactions (user_id);

create table if not exists public.event_intents (
  id text primary key,
  event_id text not null,
  event_title text not null,
  source text not null check (source in ('avlmc', 'spotify', 'ticket_click')),
  session_id text not null,
  user_id integer references public.users(id) on delete set null,
  identity_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, identity_key)
);

create index if not exists event_intents_event_id_idx
  on public.event_intents (event_id);
create index if not exists event_intents_user_id_idx
  on public.event_intents (user_id);
create index if not exists event_intents_source_idx
  on public.event_intents (source);

-- ---- Personalized discovery memory ---------------------------------------------
-- Append-only learning stream. Grows unbounded — prune old rows on a retention
-- window via the `cleanup` job (see lib/admin / system_job_runs) to control bloat.
create table if not exists public.event_interaction_events (
  id text primary key,
  event_id text not null,
  event_title text not null,
  artist_name text not null,
  venue_name text not null,
  event_date date not null,
  event_time text,
  tags text[] not null default '{}',
  action text not null check (
    action in (
      'impression',
      'detail_open',
      'avlgo_click',
      'fire',
      'planning',
      'remove',
      'unremove',
      'song_contribution',
      'note_contribution'
    )
  ),
  source text,
  session_id text not null,
  user_id integer references public.users(id) on delete set null,
  identity_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists event_interaction_events_identity_created_idx
  on public.event_interaction_events (identity_key, created_at desc);
create index if not exists event_interaction_events_event_id_idx
  on public.event_interaction_events (event_id);
create index if not exists event_interaction_events_action_idx
  on public.event_interaction_events (action);
-- Listener-Trace (admin) filters this log by user_id directly; without this index
-- those queries seq-scan a fast-growing table.
create index if not exists event_interaction_events_user_id_idx
  on public.event_interaction_events (user_id);

create table if not exists public.event_person_event_state (
  id text primary key,
  event_id text not null,
  event_title text not null,
  session_id text not null,
  user_id integer references public.users(id) on delete set null,
  identity_key text not null,
  fire_at timestamptz,
  planning_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, identity_key)
);

create index if not exists event_person_event_state_identity_idx
  on public.event_person_event_state (identity_key);
create index if not exists event_person_event_state_removed_idx
  on public.event_person_event_state (identity_key, removed_at)
  where removed_at is not null;
create index if not exists event_person_event_state_user_id_idx
  on public.event_person_event_state (user_id);

create table if not exists public.spotify_event_match_corrections (
  id text primary key,
  event_id text not null,
  event_title text not null,
  provider text not null check (provider in ('spotify')),
  matched_term text not null,
  normalized_term text not null,
  action text not null check (action in ('reject', 'replace')),
  replacement_provider_item_id text,
  replacement_name text,
  replacement_url text,
  replacement_image_url text,
  session_id text not null,
  user_id integer references public.users(id) on delete set null,
  identity_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, identity_key, provider, normalized_term)
);

create index if not exists spotify_event_match_corrections_identity_idx
  on public.spotify_event_match_corrections (identity_key, event_id);
create index if not exists spotify_event_match_corrections_user_id_idx
  on public.spotify_event_match_corrections (user_id);

-- ---- Saved/Favorites (private, signed-in only) ---------------------------------
create table if not exists public.saved_items (
  id text primary key,
  user_id integer not null references public.users(id) on delete cascade,
  item_type text not null check (item_type in ('event', 'venue', 'artist')),
  item_key text not null,
  label text not null,
  event_id text,
  created_at timestamptz not null default now(),
  unique (user_id, item_type, item_key)
);

create index if not exists saved_items_user_type_idx
  on public.saved_items (user_id, item_type);

-- ---- Shared Listening (PRD 17): public, deduped song list per event, seeded when
-- a signed-in Spotify listener Goes/Fires. Separate from contributions so it never
-- feeds discovery scoring. seeded_by_user_id is server-only and never exposed. ----
create table if not exists public.event_shared_songs (
  id text primary key,
  event_id text not null,
  event_title text not null,
  provider text not null check (provider in ('spotify')),
  provider_track_id text not null,
  name text not null,
  artist_names text[] not null default '{}',
  external_url text,
  image_url text,
  preview_url text,
  share_count integer not null default 1,
  seeded_by_user_id integer references public.users(id) on delete set null,
  first_shared_at timestamptz not null default now(),
  last_shared_at timestamptz not null default now(),
  status text not null default 'visible' check (status in ('visible', 'hidden', 'pending')),
  unique (event_id, provider, provider_track_id)
);

create index if not exists event_shared_songs_event_status_idx
  on public.event_shared_songs (event_id, status, share_count desc);

-- ---- Operations: scheduled-job observability -----------------------------------
create table if not exists public.system_job_runs (
  id text primary key,
  job text not null check (job in ('avlgo_sync', 'cleanup', 'image_backfill')),
  status text not null check (status in ('success', 'failure')),
  detail text,
  items_processed integer,
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  duration_ms integer
);

alter table public.system_job_runs
  drop constraint if exists system_job_runs_job_check;
alter table public.system_job_runs
  add constraint system_job_runs_job_check check (job in ('avlgo_sync', 'cleanup', 'image_backfill'));

create index if not exists system_job_runs_job_finished_idx
  on public.system_job_runs (job, finished_at desc);

-- ---- Admin-managed partner/resource directory ----------------------------------
create table if not exists public.admin_resources (
  id text primary key,
  type text not null check (type in (
    'source', 'playlist', 'venue_partner', 'community_org', 'press_media',
    'playlist_collaborator', 'sponsor', 'venue_contact', 'artist_resource', 'other'
  )),
  name text not null,
  description text,
  url text,
  status text not null default 'active' check (status in ('active', 'prospect', 'archived')),
  linked_venue_name text,
  linked_source text,
  surfaced_publicly boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_resources_type_status_idx
  on public.admin_resources (type, status);

-- ---- Listener feedback (404 detour + general) ----------------------------------
-- Lightweight, anonymous-friendly feedback capture (e.g. the 404 "we missed the connection"
-- detour). Public write; private to the admin. Additive + 42P01-tolerant; the submit service
-- degrades gracefully if this table isn't present yet, so the form never errors the listener.
create table if not exists public.feedback (
  id serial primary key,
  message text not null,
  email text,
  path text,
  user_id integer references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists feedback_created_at_idx on public.feedback (created_at desc);
