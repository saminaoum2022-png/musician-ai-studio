-- Raise the per-listener daily play cap from 1 to 5.
--
-- Previously social_song_plays had a unique constraint
-- (song_id, listener_user_id, play_day) so each listener counted at most ONCE
-- per song per day. We now allow up to 5 counted plays per listener per day to
-- reward repeat listens. The cap (5) is enforced in the API (record_play); the
-- DB just needs to permit multiple rows per (song, listener, day).
--
-- Run this once in the Supabase SQL editor.

alter table public.social_song_plays
  drop constraint if exists social_song_plays_one_per_listener_day;

-- Speeds up the per-day cap lookup the API does before each insert.
create index if not exists social_song_plays_listener_day_idx
  on public.social_song_plays (song_id, listener_user_id, play_day);
