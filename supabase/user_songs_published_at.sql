-- Run in Supabase SQL Editor after user_songs exists.
-- Adds a public-feed timestamp separate from the private Library creation time.

alter table public.user_songs
  add column if not exists published_at timestamptz;

-- Existing public songs keep their current relative order. Future private -> public
-- toggles are stamped by the app with the moment they become public.
update public.user_songs
  set published_at = created_at
  where public_on_profile is true
    and published_at is null;

create index if not exists user_songs_public_published_idx
  on public.user_songs (published_at desc, created_at desc)
  where public_on_profile is true;

create index if not exists user_songs_user_public_published_idx
  on public.user_songs (user_id, published_at desc, created_at desc)
  where public_on_profile is true;

comment on column public.user_songs.published_at is
  'Timestamp used to sort public-profile and discovery feeds. Stamped when a private song is made public; created_at remains the private Library creation time.';
