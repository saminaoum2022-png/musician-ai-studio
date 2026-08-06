-- Auto-create public.profiles when someone signs up (Google, Apple, email).
-- Run once in Supabase SQL Editor. Complements client + API ensureProfileRow.

create or replace function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  handle text;
begin
  handle := 'user_' || lower(substr(replace(new.id::text, '-', ''), 1, 6));
  insert into public.profiles (
    user_id,
    username,
    email,
    display_name,
    bio,
    avatar,
    is_public,
    created_at,
    updated_at
  )
  values (
    new.id,
    handle,
    coalesce(new.email, ''),
    '',
    '',
    '',
    true,
    coalesce(new.created_at, now()),
    now()
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;

create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row
  execute function public.handle_new_auth_user_profile();

-- Backfill existing auth users missing profiles (safe to re-run).
insert into public.profiles (user_id, username, email, display_name, bio, avatar, is_public, created_at, updated_at)
select
  u.id,
  'user_' || lower(substr(replace(u.id::text, '-', ''), 1, 6)),
  coalesce(u.email, ''),
  '',
  '',
  '',
  true,
  coalesce(u.created_at, now()),
  now()
from auth.users u
where not exists (
  select 1 from public.profiles p where p.user_id = u.id
)
on conflict (user_id) do nothing;
