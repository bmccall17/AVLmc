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

alter table if exists public.music_connections
  add column if not exists taste_opt_out_at timestamptz;

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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index if not exists listener_discovery_preferences_user_id_idx
  on public.listener_discovery_preferences (user_id);

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
  status text not null default 'visible' check (status in ('visible', 'hidden', 'pending'))
);

alter table if exists public.contributions
  add column if not exists music_provider text,
  add column if not exists music_provider_item_id text,
  add column if not exists music_provider_url text;

create index if not exists contributions_event_id_status_idx
  on public.contributions (event_id, status, created_at desc);

create index if not exists contributions_session_created_at_idx
  on public.contributions (session_id, created_at desc);
create index if not exists contributions_user_id_idx
  on public.contributions (user_id);

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

insert into public.event_intents (
  id,
  event_id,
  event_title,
  source,
  session_id,
  user_id,
  identity_key,
  created_at,
  updated_at
)
select
  id,
  event_id,
  event_title,
  'avlmc',
  session_id,
  user_id,
  coalesce('user:' || user_id::text, 'session:' || session_id),
  created_at,
  created_at
from public.reactions
where type = 'going'
on conflict (event_id, identity_key) do nothing;

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

create table if not exists public.system_job_runs (
  id text primary key,
  job text not null check (job in ('avlgo_sync', 'cleanup')),
  status text not null check (status in ('success', 'failure')),
  detail text,
  items_processed integer,
  started_at timestamptz not null,
  finished_at timestamptz not null default now(),
  duration_ms integer
);

create index if not exists system_job_runs_job_finished_idx
  on public.system_job_runs (job, finished_at desc);

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
