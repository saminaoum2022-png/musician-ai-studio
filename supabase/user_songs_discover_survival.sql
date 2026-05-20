-- Discover survival: 7-day public window, score starts at -100, +1 per qualified play.
-- Also run discover_play_counts.sql (max 10 counted plays per signed-in listener per song).
-- Run in Supabase SQL Editor after user_songs exists.

alter table public.user_songs
  add column if not exists discover_score integer;

alter table public.user_songs
  add column if not exists discover_expires_at timestamptz;

create index if not exists user_songs_discover_active_idx
  on public.user_songs (discover_expires_at desc nulls last, published_at desc nulls last)
  where public_on_profile is true;
