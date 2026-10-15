-- Onboarding done, server-side. Additive and lock-light. Safe to re-run.
-- Run once in Supabase SQL Editor (shared production DB). No transaction needed.
--
-- Why: "onboarding done" lived only in localStorage, so a new device / Incognito
-- window looked like a brand-new signup and landed on #/onboarding.
-- The app also treats accounts older than 2 days as done (client rule), so no backfill.
--
-- Security: this file touches ONE new column and ONE new guard trigger.
-- It does NOT alter, drop, replace or re-order profiles_guard_role_and_admin_meta
-- (role, admin_granted_*) or profiles_guard_sound_certified (verified badge),
-- and it changes no policy or grant. Pro lives in pro_subscriptions and credits in
-- user_credits (both client-locked by credits_billing_client_lockdown.sql), not on profiles.

-- 1) Column: nullable, no default = metadata-only change, no table rewrite.
alter table public.profiles
  add column if not exists onboarding_done_at timestamptz;

comment on column public.profiles.onboarding_done_at is
  'Set once when the user finishes (or skips) the first-run tour. One-way, server-timed.';

-- 2) Guard: a user updating their own row may set it once, to now(); it can never be
--    cleared, rewritten, backdated or future-dated from the client.
create or replace function public.profiles_guard_onboarding_done()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid() = new.user_id then
    if tg_op = 'INSERT' then
      new.onboarding_done_at := null;
    elsif old.onboarding_done_at is not null then
      new.onboarding_done_at := old.onboarding_done_at;
    elsif new.onboarding_done_at is not null then
      new.onboarding_done_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_onboarding_done on public.profiles;
create trigger profiles_guard_onboarding_done
  before insert or update on public.profiles
  for each row
  execute function public.profiles_guard_onboarding_done();

-- Verify the existing guards are still in place (expect 3 rows):
-- select tgname from pg_trigger
-- where tgrelid = 'public.profiles'::regclass and not tgisinternal
--   and tgname in ('profiles_guard_role_and_admin_meta','profiles_guard_sound_certified','profiles_guard_onboarding_done');
