-- Nabad AI Admin Dashboard schema
-- Run in Supabase SQL Editor before enabling admin.nabadai.com
--
-- Adds:
--   profiles.role, profiles.last_active_at, profiles.created_at
--   credits_transactions (before/after balance audit)
--   music_generation_logs (every generation request)
--   Admin RLS + updated credit RPCs that log transactions

create extension if not exists "pgcrypto";

-- ---------- profiles: admin role + activity --------------------------------

alter table public.profiles
  add column if not exists role text not null default 'user';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
    check (role in ('user', 'admin'));

alter table public.profiles
  add column if not exists last_active_at timestamptz;

alter table public.profiles
  add column if not exists created_at timestamptz not null default now();

comment on column public.profiles.role is
  'user | admin — admin can access admin.nabadai.com analytics.';

-- Set your account admin (replace email):
-- update public.profiles set role = 'admin'
-- where user_id = (select id from auth.users where lower(email) = lower('you@example.com'));

create or replace function public.is_admin_user(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where user_id = p_uid and role = 'admin'
  );
$$;

revoke all on function public.is_admin_user(uuid) from public;
grant execute on function public.is_admin_user(uuid) to authenticated, service_role;

-- ---------- credits_transactions -------------------------------------------

create table if not exists public.credits_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  delta numeric(14, 4) not null,
  balance_before numeric(14, 4) not null default 0,
  balance_after numeric(14, 4) not null default 0,
  reason text not null,
  ref text default '',
  ledger_id uuid references public.credit_ledger (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists credits_transactions_user_created_idx
  on public.credits_transactions (user_id, created_at desc);

create index if not exists credits_transactions_created_idx
  on public.credits_transactions (created_at desc);

alter table public.credits_transactions enable row level security;

drop policy if exists "credits_transactions_admin_select" on public.credits_transactions;
create policy "credits_transactions_admin_select"
  on public.credits_transactions for select
  using (public.is_admin_user(auth.uid()));

-- ---------- music_generation_logs ------------------------------------------

create table if not exists public.music_generation_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id text default '',
  kind text not null default 'song',
  provider text not null default 'suno',
  prompt text default '',
  status text not null default 'pending',
  credits_used numeric(14, 4) not null default 0,
  provider_cost_usd numeric(12, 6),
  error_message text default '',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint music_generation_logs_kind_check
    check (kind in ('song', 'photo', 'sound', 'hum_track', 'instrumental', 'music_video', 'studio_guide', 'stems', 'persona', 'mashup', 'other')),
  constraint music_generation_logs_provider_check
    check (provider in ('suno', 'other')),
  constraint music_generation_logs_status_check
    check (status in ('pending', 'completed', 'failed', 'refunded'))
);

create index if not exists music_generation_logs_user_created_idx
  on public.music_generation_logs (user_id, created_at desc);

create index if not exists music_generation_logs_task_id_idx
  on public.music_generation_logs (task_id)
  where task_id <> '';

create index if not exists music_generation_logs_status_created_idx
  on public.music_generation_logs (status, created_at desc);

alter table public.music_generation_logs enable row level security;

drop policy if exists "music_generation_logs_admin_select" on public.music_generation_logs;
create policy "music_generation_logs_admin_select"
  on public.music_generation_logs for select
  using (public.is_admin_user(auth.uid()));

-- Service role writes only (no client insert policies).

-- ---------- helper: log credit transaction ---------------------------------

create or replace function public.log_credit_transaction(
  p_user_id uuid,
  p_delta numeric(14, 4),
  p_balance_before numeric(14, 4),
  p_balance_after numeric(14, 4),
  p_reason text,
  p_ref text default '',
  p_ledger_id uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.credits_transactions (
    user_id, delta, balance_before, balance_after, reason, ref, ledger_id
  ) values (
    p_user_id, p_delta, p_balance_before, p_balance_after, p_reason, coalesce(p_ref, ''), p_ledger_id
  );
end;
$$;

revoke all on function public.log_credit_transaction(uuid, numeric, numeric, numeric, text, text, uuid) from public;
grant execute on function public.log_credit_transaction(uuid, numeric, numeric, numeric, text, text, uuid) to service_role;

-- ---------- touch last active (called from API) ------------------------------

create or replace function public.touch_user_last_active(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
    set last_active_at = now()
    where user_id = p_user_id;
end;
$$;

revoke all on function public.touch_user_last_active(uuid) from public;
grant execute on function public.touch_user_last_active(uuid) to service_role;

-- ---------- updated consume_credits (logs before/after) ----------------------

create or replace function public.consume_credits(
  p_user_id uuid,
  p_amount numeric(14, 4),
  p_reason text,
  p_ref text default ''
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric(14, 4);
  v_before numeric(14, 4);
  v_ledger_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    return json_build_object(
      'ok', false, 'status', 'bad_amount',
      'balance', 0, 'message', 'Invalid amount.'
    );
  end if;

  select balance into v_balance from public.user_credits
    where user_id = p_user_id
    for update;

  if not found then
    return json_build_object(
      'ok', false, 'status', 'insufficient',
      'balance', 0, 'needed', p_amount,
      'message', 'Not enough credits. Redeem a code from your Profile.'
    );
  end if;

  if v_balance < p_amount then
    return json_build_object(
      'ok', false, 'status', 'insufficient',
      'balance', v_balance, 'needed', p_amount,
      'message', 'Not enough credits. Redeem a code from your Profile.'
    );
  end if;

  v_before := v_balance;

  update public.user_credits
    set balance = balance - p_amount, updated_at = now()
    where user_id = p_user_id
    returning balance into v_balance;

  insert into public.credit_ledger (user_id, delta, reason, ref)
    values (p_user_id, -p_amount, p_reason, coalesce(p_ref, ''))
    returning id into v_ledger_id;

  perform public.log_credit_transaction(
    p_user_id, -p_amount, v_before, v_balance, p_reason, p_ref, v_ledger_id
  );

  return json_build_object(
    'ok', true, 'status', 'spent',
    'balance', v_balance,
    'spent', p_amount
  );
end;
$$;

revoke all on function public.consume_credits(uuid, numeric, text, text) from public;
grant execute on function public.consume_credits(uuid, numeric, text, text) to service_role;

-- ---------- updated refund_credits -----------------------------------------

create or replace function public.refund_credits(
  p_user_id uuid,
  p_amount numeric(14, 4),
  p_reason text,
  p_ref text default ''
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance numeric(14, 4);
  v_before numeric(14, 4);
  v_ledger_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    return json_build_object('ok', false, 'message', 'Invalid amount.');
  end if;

  select balance into v_before from public.user_credits
    where user_id = p_user_id;

  if not found then
    v_before := 0;
  end if;

  insert into public.user_credits (user_id, balance, updated_at)
    values (p_user_id, p_amount, now())
    on conflict (user_id) do update
      set balance = public.user_credits.balance + excluded.balance,
          updated_at = now()
    returning balance into v_balance;

  insert into public.credit_ledger (user_id, delta, reason, ref)
    values (p_user_id, p_amount, p_reason, coalesce(p_ref, ''))
    returning id into v_ledger_id;

  perform public.log_credit_transaction(
    p_user_id, p_amount, coalesce(v_before, 0), v_balance, p_reason, p_ref, v_ledger_id
  );

  return json_build_object('ok', true, 'balance', v_balance, 'refunded', p_amount);
end;
$$;

revoke all on function public.refund_credits(uuid, numeric, text, text) from public;
grant execute on function public.refund_credits(uuid, numeric, text, text) to service_role;

-- ---------- backfill credits_transactions from ledger (one-time) -------------
-- Safe to re-run: skips rows that already have a ledger_id link.

insert into public.credits_transactions (user_id, delta, balance_before, balance_after, reason, ref, ledger_id, created_at)
with ordered as (
  select
    l.*,
    sum(l.delta) over (partition by l.user_id order by l.created_at, l.id) as running
  from public.credit_ledger l
)
select
  user_id,
  delta,
  running - delta as balance_before,
  running as balance_after,
  reason,
  ref,
  id,
  created_at
from ordered
where not exists (
  select 1 from public.credits_transactions t where t.ledger_id = ordered.id
);
