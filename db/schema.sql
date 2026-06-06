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
  external_url text,
  image_url text,
  rank integer not null,
  time_range text not null,
  synced_at timestamptz not null default now(),
  unique (user_id, provider, item_type, provider_item_id, time_range)
);

create index if not exists music_profile_items_user_provider_idx
  on public.music_profile_items (user_id, provider, item_type, rank);

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
  audio_url text,
  duration_seconds integer,
  session_id text not null,
  user_id integer references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  status text not null default 'visible' check (status in ('visible', 'hidden', 'pending'))
);

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
