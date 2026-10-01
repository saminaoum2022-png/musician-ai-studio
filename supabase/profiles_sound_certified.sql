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
-- where user_id = 'YOUR-UUID-HERE';

-- Audit (who wrongly has the badge):
-- select user_id, username, email, sound_certified from public.profiles where sound_certified = true;

-- Reset everyone, then grant only real creators:
-- update public.profiles set sound_certified = false where sound_certified is distinct from false;

-- Block self-service verified (users PATCHing their own row cannot flip this flag):
create or replace function public.profiles_guard_sound_certified()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid() = new.user_id then
    if tg_op = 'INSERT' then
      new.sound_certified := false;
    elsif new.sound_certified is distinct from old.sound_certified then
      new.sound_certified := old.sound_certified;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_sound_certified on public.profiles;
create trigger profiles_guard_sound_certified
  before insert or update on public.profiles
  for each row
  execute function public.profiles_guard_sound_certified();
