-- Admin team audit log, pending invites, auto-apply on signup.
-- Run once in Supabase SQL Editor after supabase/admin_team_roles.sql

-- ---------- audit log (service role writes only) ---------------------------

create table if not exists public.admin_role_audit (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  actor_email text,
  target_user_id uuid,
  target_email text,
  action text not null,
  previous_role text,
  new_role text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_role_audit_created_at_idx
  on public.admin_role_audit (created_at desc);

comment on table public.admin_role_audit is
  'Dashboard team + moderation actions — grant, revoke, role change, invite, unpublish.';

alter table public.admin_role_audit enable row level security;

-- No client policies — Vercel service role only.

-- ---------- pending invites (email not registered yet) ---------------------

create table if not exists public.admin_team_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null,
  invited_by uuid not null,
  invited_at timestamptz not null default now(),
  accepted_at timestamptz,
  revoked_at timestamptz,
  constraint admin_team_invites_role_check
    check (role in ('admin', 'operations', 'support', 'moderator', 'finance', 'viewer'))
);

create unique index if not exists admin_team_invites_email_pending_uidx
  on public.admin_team_invites (lower(email))
  where accepted_at is null and revoked_at is null;

comment on table public.admin_team_invites is
  'Pending dashboard invites — applied when the user signs up with this email.';

alter table public.admin_team_invites enable row level security;

-- ---------- auto-apply invite when profile is created --------------------

create or replace function public.apply_pending_admin_team_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
  em text;
begin
  em := lower(trim(coalesce(new.email, '')));
  if em = '' then
    return new;
  end if;

  select *
  into inv
  from public.admin_team_invites
  where lower(email) = em
    and accepted_at is null
    and revoked_at is null
  order by invited_at desc
  limit 1;

  if not found then
    return new;
  end if;

  new.role := inv.role;
  new.admin_granted_at := now();
  new.admin_granted_by := inv.invited_by;

  update public.admin_team_invites
  set accepted_at = now()
  where id = inv.id;

  return new;
end;
$$;

drop trigger if exists profiles_apply_admin_invite on public.profiles;

create trigger profiles_apply_admin_invite
  before insert on public.profiles
  for each row
  execute function public.apply_pending_admin_team_invite();

-- Backfill: existing profiles with pending invites
update public.profiles p
set
  role = i.role,
  admin_granted_at = coalesce(p.admin_granted_at, now()),
  admin_granted_by = coalesce(p.admin_granted_by, i.invited_by)
from public.admin_team_invites i
where lower(trim(p.email)) = lower(trim(i.email))
  and i.accepted_at is null
  and i.revoked_at is null
  and p.role = 'user';

update public.admin_team_invites i
set accepted_at = now()
from public.profiles p
where lower(trim(p.email)) = lower(trim(i.email))
  and i.accepted_at is null
  and i.revoked_at is null
  and p.role = i.role;
