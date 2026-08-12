-- NabadAi admin team roles — run once in Supabase SQL Editor.
-- Extends profiles.role beyond binary user/admin for dashboard permissions.

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
    check (role in (
      'user',
      'admin',
      'operations',
      'support',
      'moderator',
      'finance',
      'viewer'
    ));

comment on column public.profiles.role is
  'App + admin role: user (default), admin (owner), operations, support, moderator, finance, viewer.';

alter table public.profiles
  add column if not exists admin_granted_at timestamptz,
  add column if not exists admin_granted_by uuid;

comment on column public.profiles.admin_granted_at is
  'When dashboard access was granted via admin console.';
comment on column public.profiles.admin_granted_by is
  'auth.users id of the admin who granted dashboard access.';

-- Dashboard access for RLS (all non-user admin roles).
create or replace function public.is_admin_user(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where user_id = p_uid
      and role in (
        'admin',
        'operations',
        'support',
        'moderator',
        'finance',
        'viewer'
      )
  );
$$;

revoke all on function public.is_admin_user(uuid) from public;
grant execute on function public.is_admin_user(uuid) to authenticated, service_role;
