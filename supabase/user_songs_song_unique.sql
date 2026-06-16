-- Prevents duplicate library rows for the same user + audio URL + kind.
-- If Postgres logs show duplicate key "user_songs_user_song_unique", the
-- song already exists in cloud — the app treats that as success on sync.
-- Run once in Supabase SQL Editor (safe to re-run).

create unique index if not exists user_songs_user_song_unique
  on public.user_songs (user_id, song_url, kind)
  where btrim(song_url) <> '';
