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
  created_at timestamptz not null default now(),
  status text not null default 'visible' check (status in ('visible', 'hidden', 'pending'))
);

create index if not exists contributions_event_id_status_idx
  on public.contributions (event_id, status, created_at desc);

create index if not exists contributions_session_created_at_idx
  on public.contributions (session_id, created_at desc);

create table if not exists public.reactions (
  id text primary key,
  event_id text not null,
  event_title text not null,
  type text not null check (type in ('going', 'fire')),
  session_id text not null,
  created_at timestamptz not null default now(),
  unique (event_id, type, session_id)
);

create index if not exists reactions_event_id_idx on public.reactions (event_id);
