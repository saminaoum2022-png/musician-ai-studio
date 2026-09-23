-- Trial credit bucket: unused trial credits expire if the user does not subscribe.
-- Paid packs, welcome/promo, and gifts are never taken.
-- Run in Supabase SQL Editor (shared staging/production DB). Safe to re-run.
--
-- Rules:
--   trial_balance — granted on weekly trial start; create only; not giftable
--   On subscribe: leftover trial_balance moves to paid_balance
--   On trial end without subscribe: leftover trial_balance is removed
--   Spend order: gift → promo → trial → paid

begin;

alter table public.user_credits
  add column if not exists trial_balance numeric(14, 4) not null default 0 check (trial_balance >= 0);

-- ---------- grant trial credits ---------------------------------------------

create or replace function public.grant_trial_credits(
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
  v_before numeric(14, 4);
  v_ledger_id uuid;
  v_ref text := coalesce(p_ref, '');
begin
  if p_amount is null or p_amount <= 0 then
    return json_build_object('ok', false, 'message', 'Invalid amount.');
  end if;

  if length(trim(v_ref)) > 0 then
    if exists (
      select 1
        from public.credit_ledger
       where user_id = p_user_id
         and reason = 'trial_grant'
         and ref = v_ref
    ) then
      select * into v_row from public.user_credits where user_id = p_user_id;
      return json_build_object(
        'ok', true,
        'duplicate', true,
        'balance', coalesce(v_row.balance, 0),
        'trial_balance', coalesce(v_row.trial_balance, 0),
        'granted', 0
      );
    end if;
  end if;

  select balance into v_before from public.user_credits where user_id = p_user_id;
  if not found then
    v_before := 0;
  end if;

  insert into public.user_credits (user_id, balance, paid_balance, gift_balance, promo_balance, trial_balance, updated_at)
    values (p_user_id, p_amount, 0, 0, 0, p_amount, now())
    on conflict (user_id) do update
      set balance = public.user_credits.balance + excluded.balance,
          trial_balance = public.user_credits.trial_balance + p_amount,
          updated_at = now()
    returning * into v_row;

  insert into public.credit_ledger (user_id, delta, reason, ref)
    values (p_user_id, p_amount, 'trial_grant', v_ref)
    returning id into v_ledger_id;

  begin
    perform public.log_credit_transaction(
      p_user_id, p_amount, coalesce(v_before, 0), v_row.balance,
      'trial_grant', p_ref, v_ledger_id
    );
  exception
    when undefined_function then null;
  end;

  return json_build_object(
    'ok', true,
    'balance', v_row.balance,
    'paid_balance', v_row.paid_balance,
    'gift_balance', v_row.gift_balance,
    'promo_balance', v_row.promo_balance,
    'trial_balance', v_row.trial_balance,
    'granted', p_amount
  );
end;
$$;

revoke all on function public.grant_trial_credits(uuid, numeric, text) from public;
grant execute on function public.grant_trial_credits(uuid, numeric, text) to service_role;

-- ---------- move leftover trial into paid (they subscribed) -----------------

create or replace function public.convert_trial_credits_to_paid(
  p_user_id uuid,
  p_ref text default ''
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.user_credits;
  v_move numeric(14, 4);
  v_before numeric(14, 4);
  v_ledger_id uuid;
begin
  select * into v_row from public.user_credits where user_id = p_user_id for update;
  if not found then
    return json_build_object('ok', true, 'converted', 0, 'balance', 0, 'trial_balance', 0, 'paid_balance', 0);
  end if;

  v_move := coalesce(v_row.trial_balance, 0);
  if v_move <= 0 then
    return json_build_object(
      'ok', true,
      'converted', 0,
      'balance', v_row.balance,
      'trial_balance', 0,
      'paid_balance', v_row.paid_balance
    );
  end if;

  v_before := v_row.balance;
  update public.user_credits
    set paid_balance = paid_balance + v_move,
        trial_balance = 0,
        updated_at = now()
    where user_id = p_user_id
    returning * into v_row;

  insert into public.credit_ledger (user_id, delta, reason, ref)
    values (p_user_id, 0, 'trial_convert', coalesce(p_ref, ''))
    returning id into v_ledger_id;

  begin
    perform public.log_credit_transaction(
      p_user_id, 0, v_before, v_row.balance,
      'trial_convert', p_ref, v_ledger_id
    );
  exception
    when undefined_function then null;
  end;

  return json_build_object(
    'ok', true,
    'converted', v_move,
    'balance', v_row.balance,
    'paid_balance', v_row.paid_balance,
    'trial_balance', v_row.trial_balance
  );
end;
$$;

revoke all on function public.convert_trial_credits_to_paid(uuid, text) from public;
grant execute on function public.convert_trial_credits_to_paid(uuid, text) to service_role;

-- ---------- expire leftover trial (they did not subscribe) ------------------

create or replace function public.expire_unused_trial_credits(
  p_user_id uuid,
  p_ref text default ''
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.user_credits;
  v_remove numeric(14, 4) := 0;
  v_from_trial numeric(14, 4) := 0;
  v_from_paid numeric(14, 4) := 0;
  v_trial_granted numeric(14, 4) := 0;
  v_packs_after numeric(14, 4) := 0;
  v_trial_at timestamptz;
  v_before numeric(14, 4);
  v_ledger_id uuid;
begin
  select * into v_row from public.user_credits where user_id = p_user_id for update;
  if not found then
    return json_build_object('ok', true, 'expired', 0, 'balance', 0);
  end if;

  if exists (
    select 1 from public.credit_ledger
     where user_id = p_user_id
       and reason = 'trial_expire'
       and created_at > now() - interval '2 days'
  ) then
    return json_build_object(
      'ok', true,
      'duplicate', true,
      'expired', 0,
      'balance', v_row.balance,
      'trial_balance', coalesce(v_row.trial_balance, 0),
      'paid_balance', v_row.paid_balance
    );
  end if;

  v_from_trial := coalesce(v_row.trial_balance, 0);

  -- Legacy: trial was granted into paid_balance before this bucket existed.
  -- Never claw paid credits if they already converted (second weekly grant or trial_convert).
  if v_from_trial <= 0
     and not exists (
       select 1 from public.credit_ledger
        where user_id = p_user_id and reason = 'trial_convert'
     )
  then
    select delta, created_at
      into v_trial_granted, v_trial_at
      from public.credit_ledger
     where user_id = p_user_id
       and delta > 0
       and (
         reason = 'trial_grant'
         or (reason = 'paid_purchase' and (
           ref like 'pro:weekly:%'
           or ref like 'stripe:pro:weekly:%'
         ))
       )
     order by created_at asc
     limit 1;

    if v_trial_granted > 0
       and not exists (
         select 1 from public.credit_ledger
          where user_id = p_user_id
            and delta > 0
            and reason = 'paid_purchase'
            and created_at > coalesce(v_trial_at, created_at)
            and (ref like 'pro:weekly:%' or ref like 'stripe:pro:weekly:%')
       )
    then
      select coalesce(sum(delta), 0) into v_packs_after
        from public.credit_ledger
       where user_id = p_user_id
         and delta > 0
         and reason = 'paid_purchase'
         and created_at >= coalesce(v_trial_at, created_at)
         and ref not like 'pro:weekly:%'
         and ref not like 'stripe:pro:weekly:%';

      v_from_paid := least(
        coalesce(v_row.paid_balance, 0),
        v_trial_granted,
        greatest(0, coalesce(v_row.paid_balance, 0) - coalesce(v_packs_after, 0))
      );
    end if;
  end if;

  v_remove := v_from_trial + v_from_paid;
  if v_remove <= 0 then
    return json_build_object(
      'ok', true,
      'expired', 0,
      'balance', v_row.balance,
      'trial_balance', coalesce(v_row.trial_balance, 0),
      'paid_balance', v_row.paid_balance
    );
  end if;

  v_before := v_row.balance;
  update public.user_credits
    set balance = balance - v_remove,
        trial_balance = trial_balance - v_from_trial,
        paid_balance = paid_balance - v_from_paid,
        updated_at = now()
    where user_id = p_user_id
    returning * into v_row;

  insert into public.credit_ledger (user_id, delta, reason, ref)
    values (p_user_id, -v_remove, 'trial_expire', coalesce(p_ref, ''))
    returning id into v_ledger_id;

  begin
    perform public.log_credit_transaction(
      p_user_id, -v_remove, v_before, v_row.balance,
      'trial_expire', p_ref, v_ledger_id
    );
  exception
    when undefined_function then null;
  end;

  return json_build_object(
    'ok', true,
    'expired', v_remove,
    'from_trial', v_from_trial,
    'from_paid', v_from_paid,
    'balance', v_row.balance,
    'paid_balance', v_row.paid_balance,
    'trial_balance', coalesce(v_row.trial_balance, 0)
  );
end;
$$;

revoke all on function public.expire_unused_trial_credits(uuid, text) from public;
grant execute on function public.expire_unused_trial_credits(uuid, text) to service_role;

-- ---------- spend: gift → promo → trial → paid ------------------------------

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
  v_from_gift := least(coalesce(v_row.gift_balance, 0), v_remaining);
  v_remaining := v_remaining - v_from_gift;
  v_from_promo := least(coalesce(v_row.promo_balance, 0), v_remaining);
  v_remaining := v_remaining - v_from_promo;
  v_from_trial := least(coalesce(v_row.trial_balance, 0), v_remaining);
  v_remaining := v_remaining - v_from_trial;
  v_from_paid := v_remaining;

  v_before := v_row.balance;
  update public.user_credits
    set balance = balance - p_amount,
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
    'spent', p_amount
  );
end;
$$;

revoke all on function public.consume_credits(uuid, numeric, text, text) from public;
grant execute on function public.consume_credits(uuid, numeric, text, text) to service_role;

commit;
