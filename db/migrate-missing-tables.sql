-- ============================================================
-- Migration: Create missing discovery tables
-- Run this in Aiven PG Studio against your production database.
-- All statements use IF NOT EXISTS so they are safe to re-run.
-- ============================================================

-- 1. event_intents — tracks planning/going intent per event per person
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

-- Backfill from existing "going" reactions (safe to re-run, uses ON CONFLICT DO NOTHING)
insert into public.event_intents (
  id, event_id, event_title, source, session_id, user_id, identity_key, created_at, updated_at
)
select
  id, event_id, event_title, 'avlmc', session_id, user_id,
  coalesce('user:' || user_id::text, 'session:' || session_id),
  created_at, created_at
from public.reactions
where type = 'going'
on conflict (event_id, identity_key) do nothing;


-- 2. event_interaction_events — logs every discovery action (impression, remove, fire, etc.)
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


-- 3. event_person_event_state — durable per-person state (fire, planning, removed)
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


-- 4. spotify_event_match_corrections — user corrections to Spotify artist matches
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
