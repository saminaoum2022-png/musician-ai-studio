-- Admin generation logs: Suno request payload + expanded kinds (cover, remix, extend).
-- Safe to run once on shared production/staging Supabase.

alter table public.music_generation_logs
  add column if not exists request_detail text default '';

alter table public.music_generation_logs
  drop constraint if exists music_generation_logs_kind_check;

alter table public.music_generation_logs
  add constraint music_generation_logs_kind_check
  check (kind in (
    'song', 'photo', 'sound', 'hum_track', 'instrumental', 'music_video',
    'studio_guide', 'stems', 'persona', 'mashup', 'cover', 'extend', 'remix', 'other'
  ));
