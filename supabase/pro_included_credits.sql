-- Pro included credits: refresh each billing period (no stacking), per NabadAi Terms (2 Oct 2026).
-- Run once in Supabase SQL Editor. Additive and backward compatible:
--   * New bucket user_credits.pro_included_balance (default 0) — counted inside `balance`.
--   * New pro_subscriptions.credit_policy: 'stack' (grandfathered, paid before 2 Oct 2026)
--     or 'refresh' (new / trial→paid). Existing rows stay 'stack'; trialing rows become 'refresh'.
--   * New RPCs: grant_pro_period_credits (RESET included balance, not add), expire_pro_included_credits.
--   * consume_credits now spends the expiring included bucket first.
--
-- BEFORE RUNNING — confirm the live consume_credits matches supabase/trial_credits.sql
-- (spend order gift → promo → trial → paid). In the SQL editor run:
--   select pg_get_functiondef('public.consume_credits(uuid,numeric,text,text)'::regprocedure);
-- If it differs, stop and tell the agent.
--
-- Safe to deploy the API before or after this file: the API falls back to the old additive
-- grant when these RPCs/columns are missing. Safe to re-run.

begin;

-- ---------- columns ----------------------------------------------------------

alter table public.user_credits
  add column if not exists pro_included_balance numeric(14, 4) not null default 0
  check (pro_included_balance >= 0);

comment on column public.user_credits.pro_included_balance is
  'Included Pro subscription credits for the CURRENT billing period. Reset at each renewal, removed on expiry. Not giftable.';

-- Existing rows start as grandfathered ('stack'); new rows default to 'refresh'.
alter table public.pro_subscriptions
  add column if not exists credit_policy text not null default 'stack';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pro_subscriptions_credit_policy_check'
  ) then
    alter table public.pro_subscriptions
      add constraint pro_subscriptions_credit_policy_check
      check (credit_policy in ('stack', 'refresh'));
  end if;
end $$;

alter table public.pro_subscriptions alter column credit_policy set default 'refresh';

comment on column public.pro_subscriptions.credit_policy is
  'stack = paid before 2 Oct 2026 (keeps stacking until first renewal on/after 1 Nov 2026); refresh = included credits reset each period.';

-- Anyone still in a free trial is a "new" subscriber under the Terms.
update public.pro_subscriptions
   set credit_policy = 'refresh'
 where status = 'trialing'
   and credit_policy = 'stack';

-- ---------- grant: RESET included balance to the period allowance -------------

create or replace function public.grant_pro_period_credits(
  p_user_id uuid,
  p_amount numeric(14, 4),
  p_ref text default ''
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.user_credits;
  v_ref text := coalesce(p_ref, '');
  v_old numeric(14, 4) := 0;
  v_before numeric(14, 4) := 0;
  v_mid numeric(14, 4) := 0;
  v_expire_ledger_id uuid;
  v_grant_ledger_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    return json_build_object('ok', false, 'message', 'Invalid amount.');
  end if;

  if length(trim(v_ref)) > 0 and exists (
    select 1 from public.credit_ledger
     where user_id = p_user_id
       and reason = 'pro_period_grant'
       and ref = v_ref
  ) then
    select * into v_row from public.user_credits where user_id = p_user_id;
    return json_build_object(
      'ok', true,
      'duplicate', true,
      'granted', 0,
      'balance', coalesce(v_row.balance, 0),
      'pro_included_balance', coalesce(v_row.pro_included_balance, 0)
    );
  end if;

  insert into public.user_credits (user_id, balance, paid_balance, gift_balance, promo_balance, pro_included_balance, updated_at)
    values (p_user_id, 0, 0, 0, 0, 0, now())
    on conflict (user_id) do nothing;

  select * into v_row from public.user_credits where user_id = p_user_id for update;

  v_old := coalesce(v_row.pro_included_balance, 0);
  v_before := v_row.balance;
  v_mid := v_before - v_old;

  update public.user_credits
     set balance = v_before - v_old + p_amount,
         pro_included_balance = p_amount,
         updated_at = now()
   where user_id = p_user_id
   returning * into v_row;

  if v_old > 0 then
    insert into public.credit_ledger (user_id, delta, reason, ref)
      values (p_user_id, -v_old, 'pro_period_expire', v_ref)
      returning id into v_expire_ledger_id;
    begin
      perform public.log_credit_transaction(
        p_user_id, -v_old, v_before, v_mid, 'pro_period_expire', v_ref, v_expire_ledger_id
      );
    exception
      when undefined_function then null;
    end;
  end if;

  insert into public.credit_ledger (user_id, delta, reason, ref)
    values (p_user_id, p_amount, 'pro_period_grant', v_ref)
    returning id into v_grant_ledger_id;
  begin
    perform public.log_credit_transaction(
      p_user_id, p_amount, v_mid, v_row.balance, 'pro_period_grant', v_ref, v_grant_ledger_id
    );
  exception
    when undefined_function then null;
  end;

  return json_build_object(
    'ok', true,
    'granted', p_amount,
    'expired', v_old,
    'balance', v_row.balance,
    'paid_balance', v_row.paid_balance,
    'gift_balance', v_row.gift_balance,
    'promo_balance', v_row.promo_balance,
    'pro_included_balance', v_row.pro_included_balance
  );
end;
$$;

revoke all on function public.grant_pro_period_credits(uuid, numeric, text) from public;
grant execute on function public.grant_pro_period_credits(uuid, numeric, text) to service_role;

-- ---------- expire: subscription ended, remove unspent included credits -------

create or replace function public.expire_pro_included_credits(
  p_user_id uuid,
  p_ref text default ''
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.user_credits;
  v_old numeric(14, 4) := 0;
  v_before numeric(14, 4) := 0;
  v_ledger_id uuid;
begin
  select * into v_row from public.user_credits where user_id = p_user_id for update;
  if not found then
    return json_build_object('ok', true, 'expired', 0, 'balance', 0, 'pro_included_balance', 0);
  end if;

  v_old := coalesce(v_row.pro_included_balance, 0);
  if v_old <= 0 then
    return json_build_object(
      'ok', true, 'expired', 0,
      'balance', v_row.balance, 'pro_included_balance', 0
    );
  end if;

  v_before := v_row.balance;
  update public.user_credits
     set balance = balance - v_old,
         pro_included_balance = 0,
         updated_at = now()
   where user_id = p_user_id
   returning * into v_row;

  insert into public.credit_ledger (user_id, delta, reason, ref)
    values (p_user_id, -v_old, 'pro_period_expire', coalesce(p_ref, ''))
    returning id into v_ledger_id;
  begin
    perform public.log_credit_transaction(
      p_user_id, -v_old, v_before, v_row.balance, 'pro_period_expire', p_ref, v_ledger_id
    );
  exception
    when undefined_function then null;
  end;

  return json_build_object(
    'ok', true,
    'expired', v_old,
    'balance', v_row.balance,
    'pro_included_balance', 0
  );
end;
$$;

revoke all on function public.expire_pro_included_credits(uuid, text) from public;
grant execute on function public.expire_pro_included_credits(uuid, text) to service_role;

-- ---------- spend: included (expires) → gift → promo → trial → paid -----------
-- Same as supabase/trial_credits.sql consume_credits, plus the included bucket first so users
-- never lose included credits while holding non-expiring ones.

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
  v_row public.user_credits;
  v_remaining numeric(14, 4);
  v_from_included numeric(14, 4) := 0;
  v_from_gift numeric(14, 4) := 0;
  v_from_promo numeric(14, 4) := 0;
  v_from_trial numeric(14, 4) := 0;
  v_from_paid numeric(14, 4) := 0;
  v_before numeric(14, 4);
  v_ledger_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    return json_build_object('ok', false, 'status', 'bad_amount', 'message', 'Invalid amount.');
  end if;

  select * into v_row from public.user_credits where user_id = p_user_id for update;

  if not found or v_row.balance < p_amount then
    return json_build_object(
      'ok', false, 'status', 'insufficient',
      'balance', coalesce(v_row.balance, 0),
      'needed', p_amount,
      'message', 'Not enough credits. Redeem a code from your Profile.'
    );
  end if;

  v_remaining := p_amount;
  v_from_included := least(coalesce(v_row.pro_included_balance, 0), v_remaining);
  v_remaining := v_remaining - v_from_included;
  v_from_gift := least(coalesce(v_row.gift_balance, 0), v_remaining);
  v_remaining := v_remaining - v_from_gift;
  v_from_promo := least(coalesce(v_row.promo_balance, 0), v_remaining);
  v_remaining := v_remaining - v_from_promo;
  v_from_trial := least(coalesce(v_row.trial_balance, 0), v_remaining);
  v_remaining := v_remaining - v_from_trial;
  -- Paid takes what the paid bucket really has. Anything beyond the buckets (older accounts, refunds that
  -- only went to the total) still comes off balance, so a bucket mismatch can never block a generation.
  v_from_paid := least(coalesce(v_row.paid_balance, 0), v_remaining);

  v_before := v_row.balance;
  update public.user_credits
    set balance = balance - p_amount,
        pro_included_balance = pro_included_balance - v_from_included,
        gift_balance = gift_balance - v_from_gift,
        promo_balance = promo_balance - v_from_promo,
        trial_balance = trial_balance - v_from_trial,
        paid_balance = paid_balance - v_from_paid,
        updated_at = now()
    where user_id = p_user_id
    returning * into v_row;

  insert into public.credit_ledger (user_id, delta, reason, ref)
    values (p_user_id, -p_amount, p_reason, coalesce(p_ref, ''))
    returning id into v_ledger_id;

  begin
    perform public.log_credit_transaction(
      p_user_id, -p_amount, v_before, v_row.balance, p_reason, p_ref, v_ledger_id
    );
  exception
    when undefined_function then null;
  end;

  return json_build_object(
    'ok', true, 'status', 'spent',
    'balance', v_row.balance,
    'paid_balance', v_row.paid_balance,
    'gift_balance', v_row.gift_balance,
    'promo_balance', v_row.promo_balance,
    'trial_balance', coalesce(v_row.trial_balance, 0),
    'pro_included_balance', coalesce(v_row.pro_included_balance, 0),
    'spent', p_amount
  );
end;
$$;

revoke all on function public.consume_credits(uuid, numeric, text, text) from public;
grant execute on function public.consume_credits(uuid, numeric, text, text) to service_role;

commit;
