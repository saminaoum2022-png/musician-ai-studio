-- Live Listen — host-owned one-song session.
-- API uses the service role; RLS denies direct client access so join/create
-- stay mutual-fan gated through /api/music/listen-session.
-- Run once in the Supabase SQL editor (shared DB — this affects live data).

create table if not exists public.listen_sessions (
  id uuid primary key default gen_random_uuid(),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  guest_user_id uuid not null references auth.users(id) on delete cascade,
  song_id text,
  song_title text,
  song_cover text,
  song_url text not null,
  song_owner_id uuid,
  started_at timestamptz not null default now(),
  position_ms integer not null default 0,
  playing boolean not null default true,
  host_sent_at bigint,
  duration_ms integer,
  expires_at timestamptz not null,
  status text not null default 'live'
    check (status in ('live', 'ended')),
  guest_joined boolean not null default false,
  hide_titles boolean not null default false,
  thread_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listen_sessions_host_live_idx
  on public.listen_sessions (host_user_id, status, expires_at desc);

create index if not exists listen_sessions_guest_live_idx
  on public.listen_sessions (guest_user_id, status, expires_at desc);

create index if not exists listen_sessions_expires_idx
  on public.listen_sessions (expires_at);

alter table public.listen_sessions enable row level security;
-- No policies on purpose: only the service role (server API) reads/writes.
-- Clock ticks go over authenticated Realtime broadcast, not table SELECT.
