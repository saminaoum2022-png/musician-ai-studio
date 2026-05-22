-- Song moments: share a library track to your 24h story (cover card + audio preview).
-- Run in Supabase SQL Editor after social_moments.sql.

alter table public.social_moments
  add column if not exists kind text not null default 'photo';

alter table public.social_moments
  add column if not exists song_title text;

alter table public.social_moments
  add column if not exists song_audio_url text;

alter table public.social_moments
  drop constraint if exists social_moments_kind_check;

alter table public.social_moments
  add constraint social_moments_kind_check
  check (kind in ('photo', 'song'));

alter table public.social_moments
  drop constraint if exists social_moments_song_audio_len;

alter table public.social_moments
  add constraint social_moments_song_audio_len
  check (song_audio_url is null or char_length(song_audio_url) between 8 and 2048);

comment on column public.social_moments.kind is 'photo = camera/gallery; song = library track story';
comment on column public.social_moments.song_title is 'Display title when kind=song';
comment on column public.social_moments.song_audio_url is 'Playable audio URL when kind=song';
