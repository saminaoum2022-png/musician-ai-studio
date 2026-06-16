-- Batch play counts for feeds/profile (one DB round-trip instead of N per-song scans).
-- social_song_plays_song_idx already exists in social_follows_notifications.sql.

create or replace function public.social_song_play_counts(p_song_ids text[])
returns table(song_id text, play_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select p.song_id, count(*)::bigint as play_count
  from public.social_song_plays p
  where p.song_id = any(p_song_ids)
  group by p.song_id;
$$;

grant execute on function public.social_song_play_counts(text[]) to service_role;
