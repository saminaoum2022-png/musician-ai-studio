-- Run in Supabase SQL Editor after user_songs exists.
-- Lets visitors read only rows the owner marked for their public profile (#/u/handle).

alter table public.user_songs
  add column if not exists public_on_profile boolean not null default false;

create index if not exists user_songs_public_profile_idx
  on public.user_songs (user_id, public_on_profile)
  where public_on_profile is true;

drop policy if exists "user_songs_select_public_on_profile" on public.user_songs;

create policy "user_songs_select_public_on_profile"
  on public.user_songs for select
  using (public_on_profile is true);

comment on column public.user_songs.public_on_profile is
  'When true, anon + other users may SELECT this row (title/art/url) for the owner''s public profile page.';
