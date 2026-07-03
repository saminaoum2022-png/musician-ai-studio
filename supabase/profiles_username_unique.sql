-- Case-insensitive unique usernames on public profiles.
-- Run once in Supabase SQL editor after deduping any existing collisions.

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username))
  where username is not null and trim(username) <> '' and lower(trim(username)) <> 'guest';
