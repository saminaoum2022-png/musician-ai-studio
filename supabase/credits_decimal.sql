-- Migrate credits from INTEGER to NUMERIC so balances can reflect Suno's
-- fractional pricing (e.g. sounds at 2.5 credits). Run in Supabase SQL Editor
-- AFTER the initial credits.sql has been applied.
--
-- FUTURE: peer-to-peer credit transfers will need a new RPC (e.g.
-- transfer_credits) + ledger reason 'peer_transfer' — not implemented here.

begin;

alter table public.user_credits
  alter column balance type numeric(14, 4) using balance::numeric(14, 4);

alter table public.credit_ledger
  alter column delta type numeric(14, 4) using delta::numeric(14, 4);

alter table public.promo_codes
  alter column credits type numeric(14, 4) using credits::numeric(14, 4);

alter table public.promo_redemptions
  alter column credits type numeric(14, 4) using credits::numeric(14, 4);

-- Replace RPCs: drop old integer signatures, recreate with numeric amounts.
drop function if exists public.consume_credits(uuid, integer, text, text);
drop function if exists public.refund_credits(uuid, integer, text, text);

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
  v_balance numeric(14, 4);
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

revoke all on function public.consume_credits(uuid, numeric, text, text) from public;
grant execute on function public.consume_credits(uuid, numeric, text, text) to service_role;

revoke all on function public.refund_credits(uuid, numeric, text, text) from public;
grant execute on function public.refund_credits(uuid, numeric, text, text) to service_role;

create or replace function public.get_credits_summary()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_users integer;
  v_allocated numeric(14, 4);
  v_spent numeric(14, 4);
  v_outstanding numeric(14, 4);
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

commit;
