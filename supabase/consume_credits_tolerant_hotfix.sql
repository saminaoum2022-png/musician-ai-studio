-- HOTFIX (safe to run on its own, today): stop "Credit check failed" for users whose credit buckets
-- are lower than their real balance.
--
-- Cause: refund_credits only adds to `balance`, not to a bucket. After failed generations are refunded,
-- balance can be higher than the buckets; consume_credits then tried to take the rest from paid_balance,
-- which can't go below 0, so the whole spend errored.
-- Fix: take from paid_balance only what it really has; the rest still comes off `balance`.
-- Everything else in the function is identical to the live version (checked against the live definition).
-- Later migrations (pro_included_credits.sql, gift_credit_lots.sql) include this same fix.

begin;

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
  -- Paid takes what the paid bucket really has. Anything beyond the buckets (older accounts, refunds that
  -- only went to the total) still comes off balance, so a bucket mismatch can never block a generation.
  v_from_paid := least(coalesce(v_row.paid_balance, 0), v_remaining);

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
