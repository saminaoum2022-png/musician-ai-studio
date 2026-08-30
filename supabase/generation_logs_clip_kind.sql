-- Allow Lyria clip rows in music_generation_logs (Nabad Clip, template/spark clips).
-- Safe to run once on shared production/staging Supabase.

alter table public.music_generation_logs
  drop constraint if exists music_generation_logs_kind_check;

alter table public.music_generation_logs
  add constraint music_generation_logs_kind_check
  check (kind in (
    'song', 'photo', 'sound', 'hum_track', 'instrumental', 'music_video',
    'studio_guide', 'stems', 'persona', 'mashup', 'cover', 'extend', 'remix', 'clip', 'other'
  ));
