-- Voice notes on Friends status posts (tap record in compose sheet).
-- Run in Supabase SQL Editor after social_status_posts.sql.

alter table public.social_status_posts
  add column if not exists audio_url text;

alter table public.social_status_posts
  add column if not exists duration_ms integer;

alter table public.social_status_posts
  add column if not exists waveform_peaks jsonb;

alter table public.social_status_posts
  drop constraint if exists social_status_posts_body_len;

alter table public.social_status_posts
  add constraint social_status_posts_body_len check (
    char_length(body) <= 320
    and (
      char_length(body) >= 1
      or audio_url is not null
    )
  );

alter table public.social_status_posts
  drop constraint if exists social_status_posts_audio_len;

alter table public.social_status_posts
  add constraint social_status_posts_audio_len check (
    audio_url is null or char_length(audio_url) between 8 and 2048
  );

alter table public.social_status_posts
  drop constraint if exists social_status_posts_duration_ms_range;

alter table public.social_status_posts
  add constraint social_status_posts_duration_ms_range check (
    duration_ms is null or (duration_ms >= 500 and duration_ms <= 60000)
  );

comment on column public.social_status_posts.audio_url is 'Public URL for voice status (status_audio bucket)';
comment on column public.social_status_posts.duration_ms is 'Recorded clip length in milliseconds';
comment on column public.social_status_posts.waveform_peaks is 'Normalized peak heights 0–1 for feed wave card';
