-- Optional performance index for Challenge entries stored in user_songs.meta.
-- Run in Supabase SQL Editor after user_songs exists.
-- No schema column is required; the app stores challenge data in meta->'challenge'.

create index if not exists user_songs_public_challenge_idx
  on public.user_songs ((meta->'challenge'->>'id'), published_at desc, created_at desc)
  where public_on_profile is true
    and meta ? 'challenge';

comment on index public.user_songs_public_challenge_idx is
  'Speeds public Challenge entry counts and latest-entry rails by meta.challenge.id.';
