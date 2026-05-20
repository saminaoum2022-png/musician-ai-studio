-- Per-listener play cap for Discover survival (max 10 counted plays per user per song).
-- Run in Supabase SQL Editor after user_songs exists.

create table if not exists public.discover_play_counts (
  song_id uuid not null references public.user_songs(id) on delete cascade,
  listener_id uuid not null,
  play_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (song_id, listener_id),
  constraint discover_play_counts_cap check (play_count >= 0 and play_count <= 10)
);

create index if not exists discover_play_counts_listener_idx
  on public.discover_play_counts (listener_id, updated_at desc);

alter table public.discover_play_counts enable row level security;
