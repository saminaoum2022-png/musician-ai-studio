-- Now Playing Presence — Nabad-only activity surfaced in DM headers.
-- Tracks activity that happens INSIDE Nabad only (never Spotify / Apple Music /
-- device media). API uses the service role; RLS denies direct client access so
-- presence can only be read through the mutual-follow-gated /api/messages route.
-- Run once in the Supabase SQL editor.

create table if not exists public.user_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  -- 'idle' | 'now_playing' | 'creating' | 'recording'
  status text not null default 'idle'
    check (status in ('idle', 'now_playing', 'creating', 'recording')),
  song_id text,
  song_title text,
  song_cover text,
  song_url text,
  song_owner_id uuid,
  updated_at timestamptz not null default now(),
  -- Presence is ignored once expired (linger window keeps "now playing" visible
  -- for ~45s after pause to avoid flicker).
  expires_at timestamptz
);

create index if not exists user_presence_expires_idx
  on public.user_presence (expires_at);

alter table public.user_presence enable row level security;
-- No policies on purpose: only the service role (server API) reads/writes.

-- Presence privacy preferences live on the profile row.
alter table public.profiles
  add column if not exists presence_enabled boolean not null default true;
alter table public.profiles
  add column if not exists presence_hide_titles boolean not null default false;
