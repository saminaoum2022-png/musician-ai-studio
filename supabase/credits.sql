-- Credits system — per-user balance, promo code redemptions, and an
-- append-only ledger for full audit (`+30 NABADAI-BETA-2026-A1B2`,
-- `-10 full song`, `+10 refund`). Run inside the Supabase SQL Editor.
--
-- Design notes:
--   - The Vercel server ALWAYS calls these RPCs with the service role
--     key after verifying the user's JWT via /auth/v1/user. Functions
--     are SECURITY DEFINER and trust the user_id we hand them — RLS
--     keeps direct REST traffic from users locked out.
--   - All mutations go through the three RPCs below so the schema can
--     evolve without rewriting the API code.

create extension if not exists "pgcrypto";

-- ---------- tables ----------------------------------------------------

create table if not exists public.user_credits (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  delta integer not null,
  reason text not null,
  ref text default '',
  created_at timestamptz not null default now()
);

create index if not exists credit_ledger_user_created_idx
  on public.credit_ledger (user_id, created_at desc);

create table if not exists public.promo_codes (
  code text primary key,
  credits integer not null check (credits > 0),
  max_redemptions integer not null default 1 check (max_redemptions > 0),
  redemptions integer not null default 0,
  active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.promo_redemptions (
  code text not null references public.promo_codes (code) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  credits integer not null,
  created_at timestamptz not null default now(),
  primary key (code, user_id)
);

create index if not exists promo_redemptions_user_idx
  on public.promo_redemptions (user_id, created_at desc);

-- ---------- RLS -------------------------------------------------------
--
-- Users can READ their own balance + their own ledger rows. Writes
-- always go through SECURITY DEFINER RPCs, so we don't need INSERT/
-- UPDATE policies here at all. promo_codes is fully locked down (only
-- the service role on the server can touch it).

alter table public.user_credits enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;

drop policy if exists "user_credits_select_own" on public.user_credits;
create policy "user_credits_select_own"
  on public.user_credits for select
  using (auth.uid() = user_id);

drop policy if exists "credit_ledger_select_own" on public.credit_ledger;
create policy "credit_ledger_select_own"
  on public.credit_ledger for select
  using (auth.uid() = user_id);

drop policy if exists "promo_redemptions_select_own" on public.promo_redemptions;
create policy "promo_redemptions_select_own"
  on public.promo_redemptions for select
  using (auth.uid() = user_id);

-- ---------- RPCs ------------------------------------------------------

-- redeem_promo_code: atomic + idempotent.
--  - Returns json: { ok, balance, credits_added, status, message }
--  - Status values:
--      'redeemed'        — first redemption, credits added.
--      'already_redeemed'— same user retried; balance unchanged, no error.
--      'invalid_code'    — code doesn't exist.
--      'inactive_code'   — code disabled or expired.
--      'exhausted_code'  — max_redemptions reached.
create or replace function public.redeem_promo_code(
  p_user_id uuid,
  p_code text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code public.promo_codes;
  v_existing public.promo_redemptions;
  v_balance integer;
begin
  select * into v_existing
    from public.promo_redemptions
    where code = p_code and user_id = p_user_id
    for update;

  if found then
    select balance into v_balance from public.user_credits
      where user_id = p_user_id;
    return json_build_object(
      'ok', true,
      'status', 'already_redeemed',
      'balance', coalesce(v_balance, 0),
      'credits_added', 0,
      'message', 'You already redeemed this code.'
    );
  end if;

  select * into v_code
    from public.promo_codes
    where code = p_code
    for update;

  if not found then
    return json_build_object(
      'ok', false, 'status', 'invalid_code',
      'balance', 0, 'credits_added', 0,
      'message', 'Code not found.'
    );
  end if;

  if not v_code.active then
    return json_build_object(
      'ok', false, 'status', 'inactive_code',
      'balance', 0, 'credits_added', 0,
      'message', 'Code is no longer active.'
    );
  end if;

  if v_code.expires_at is not null and v_code.expires_at < now() then
    return json_build_object(
      'ok', false, 'status', 'inactive_code',
      'balance', 0, 'credits_added', 0,
      'message', 'Code has expired.'
    );
  end if;

  if v_code.redemptions >= v_code.max_redemptions then
    return json_build_object(
      'ok', false, 'status', 'exhausted_code',
      'balance', 0, 'credits_added', 0,
      'message', 'Code has been fully used.'
    );
  end if;

  insert into public.promo_redemptions (code, user_id, credits)
    values (p_code, p_user_id, v_code.credits);

  update public.promo_codes
    set redemptions = redemptions + 1
    where code = p_code;

  insert into public.user_credits (user_id, balance, updated_at)
    values (p_user_id, v_code.credits, now())
    on conflict (user_id) do update
      set balance = public.user_credits.balance + excluded.balance,
          updated_at = now()
    returning balance into v_balance;

  insert into public.credit_ledger (user_id, delta, reason, ref)
    values (p_user_id, v_code.credits, 'promo_redeem', p_code);

  return json_build_object(
    'ok', true,
    'status', 'redeemed',
    'balance', v_balance,
    'credits_added', v_code.credits,
    'message', 'Redeemed successfully.'
  );
end;
$$;

revoke all on function public.redeem_promo_code(uuid, text) from public;
grant execute on function public.redeem_promo_code(uuid, text) to service_role;

-- consume_credits: atomic spend with insufficient_funds guard.
-- Reason is a short string ("full_song", "stems", "persona") and ref is
-- the Suno taskId or any other correlation id (used later for refunds).
create or replace function public.consume_credits(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_ref text default ''
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
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

  update public.user_credits
    set balance = balance - p_amount, updated_at = now()
    where user_id = p_user_id
    returning balance into v_balance;

  insert into public.credit_ledger (user_id, delta, reason, ref)
    values (p_user_id, -p_amount, p_reason, coalesce(p_ref, ''));

  return json_build_object(
    'ok', true, 'status', 'spent',
    'balance', v_balance,
    'spent', p_amount
  );
end;
$$;

revoke all on function public.consume_credits(uuid, integer, text, text) from public;
grant execute on function public.consume_credits(uuid, integer, text, text) to service_role;

-- refund_credits: undo a previous consume_credits when the upstream call
-- fails after we deducted. Always succeeds (creates the row if missing).
create or replace function public.refund_credits(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_ref text default ''
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  if p_amount is null or p_amount <= 0 then
    return json_build_object('ok', false, 'message', 'Invalid amount.');
  end if;

  insert into public.user_credits (user_id, balance, updated_at)
    values (p_user_id, p_amount, now())
    on conflict (user_id) do update
      set balance = public.user_credits.balance + excluded.balance,
          updated_at = now()
    returning balance into v_balance;

  insert into public.credit_ledger (user_id, delta, reason, ref)
    values (p_user_id, p_amount, p_reason, coalesce(p_ref, ''));

  return json_build_object('ok', true, 'balance', v_balance, 'refunded', p_amount);
end;
$$;

revoke all on function public.refund_credits(uuid, integer, text, text) from public;
grant execute on function public.refund_credits(uuid, integer, text, text) to service_role;

-- get_credits_summary: admin only — totals across all users. Cheap on
-- a small beta DB and saves an extra round-trip from the Vercel function.
create or replace function public.get_credits_summary()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_users integer;
  v_allocated integer;
  v_spent integer;
  v_outstanding integer;
  v_codes_total integer;
  v_codes_redeemed integer;
begin
  select count(*), coalesce(sum(balance), 0)
    into v_users, v_outstanding from public.user_credits;
  select coalesce(sum(case when delta > 0 then delta else 0 end), 0),
         coalesce(sum(case when delta < 0 then -delta else 0 end), 0)
    into v_allocated, v_spent from public.credit_ledger;
  select count(*), coalesce(sum(redemptions), 0)
    into v_codes_total, v_codes_redeemed from public.promo_codes;

  return json_build_object(
    'users', coalesce(v_users, 0),
    'allocated_total', coalesce(v_allocated, 0),
    'spent_total', coalesce(v_spent, 0),
    'outstanding', coalesce(v_outstanding, 0),
    'codes_total', coalesce(v_codes_total, 0),
    'codes_redeemed', coalesce(v_codes_redeemed, 0)
  );
end;
$$;

revoke all on function public.get_credits_summary() from public;
grant execute on function public.get_credits_summary() to service_role;
