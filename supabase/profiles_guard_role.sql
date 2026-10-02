-- Tier 0: block self-service changes to dashboard role columns on profiles.
-- Run once in Supabase SQL Editor (shared production DB). Safe to re-run.
--
-- Matches profiles_guard_sound_certified: users updating their own row (JWT) cannot
-- escalate role or admin grant metadata. Service role / SQL Editor (auth.uid() null) unchanged.

alter table public.profiles
  add column if not exists role text not null default 'user';

alter table public.profiles
  add column if not exists admin_granted_at timestamptz,
  add column if not exists admin_granted_by uuid;

create or replace function public.profiles_guard_role_and_admin_meta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid() = new.user_id then
    if tg_op = 'INSERT' then
      new.role := 'user';
      new.admin_granted_at := null;
      new.admin_granted_by := null;
    else
      if new.role is distinct from old.role then
        new.role := old.role;
      end if;
      if new.admin_granted_at is distinct from old.admin_granted_at then
        new.admin_granted_at := old.admin_granted_at;
      end if;
      if new.admin_granted_by is distinct from old.admin_granted_by then
        new.admin_granted_by := old.admin_granted_by;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_role_and_admin_meta on public.profiles;
create trigger profiles_guard_role_and_admin_meta
  before insert or update on public.profiles
  for each row
  execute function public.profiles_guard_role_and_admin_meta();

-- Verify (signed-in test user JWT): PATCH role=admin should not stick (200 but role stays user).
-- select user_id, role, admin_granted_at from public.profiles where user_id = '<test_uid>';
