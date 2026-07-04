-- Optional: gate the "Verified Nabad Creator" badge on Profile.
-- After running, set `sound_certified = true` only for users who pass
-- your certification flow (never default true for everyone).
-- The app reads this via `select=*` on profiles; upsert does not send
-- this column yet — flip rows in SQL or add to upsert once ready.

alter table public.profiles
  add column if not exists sound_certified boolean not null default false;

comment on column public.profiles.sound_certified is
  'When true, Profile shows "Verified Nabad Creator". Managed server-side; not user-editable from the client upsert until explicitly wired.';

-- Grant verified badge to a specific account (adjust WHERE for your user_id or email).
-- Example for founder — run once in Supabase SQL Editor:
-- update public.profiles
-- set sound_certified = true
-- where user_id = 'YOUR-UUID-HERE'
--    or email ilike '%samynaoum%';
