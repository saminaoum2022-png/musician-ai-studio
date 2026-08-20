-- Expand suno_generation_watch.kind for cover / remix / extend / stems.
-- Safe to run once on shared production/staging Supabase.
-- Until this runs, api/_lib/suno-generation-watch.js coerces those kinds into
-- allowed values (song / instrumental) so watches still register.

alter table public.suno_generation_watch
  drop constraint if exists suno_generation_watch_kind_check;

alter table public.suno_generation_watch
  add constraint suno_generation_watch_kind_check
  check (kind in (
    'song', 'photo', 'sound', 'hum_track', 'instrumental', 'music_video',
    'studio_guide', 'stems', 'cover', 'extend', 'remix'
  ));
