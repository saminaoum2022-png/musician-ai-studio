-- Admin adjust/remove paid credits (TestFlight cleanup + support).
-- Run once in Supabase SQL Editor (shared staging/production DB).
-- Safe to re-run.

create or replace function public.adjust_paid_credits(
  p_user_id uuid,
  p_delta numeric(14, 4),
  p_reason text default 'admin_adjust',
  p_ref text default ''
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.user_credits;
  v_before numeric(14, 4);
  v_delta numeric(14, 4);
  v_remove numeric(14, 4);
  v_reason text;
  v_ledger_id uuid;
begin
  if p_user_id is null then
    return json_build_object('ok', false, 'message', 'Missing user.');
  end if;

  if p_delta is null or p_delta = 0 then
    return json_build_object('ok', false, 'message', 'Amount must be non-zero.');
  end if;

  if abs(p_delta) > 10000 then
    return json_build_object('ok', false, 'message', 'Amount must be at most 10000.');
  end if;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');
  if v_reason is null then
    v_reason := case when p_delta < 0 then 'admin_remove' else 'admin_adjust' end;
  end if;
  v_reason := left(v_reason, 80);

  select * into v_row from public.user_credits where user_id = p_user_id for update;
  if not found then
    if p_delta < 0 then
      return json_build_object('ok', false, 'message', 'User has no credit balance.');
    end if;
    insert into public.user_credits (user_id, balance, paid_balance, gift_balance, promo_balance, updated_at)
      values (p_user_id, 0, 0, 0, 0, now())
      returning * into v_row;
  end if;

  v_before := coalesce(v_row.balance, 0);

  if p_delta > 0 then
    update public.user_credits
      set balance = balance + p_delta,
          paid_balance = paid_balance + p_delta,
          updated_at = now()
      where user_id = p_user_id
      returning * into v_row;
    v_delta := p_delta;
  else
    -- Remove from paid_balance first (Pro / admin grants). Never go below zero.
    v_remove := least(abs(p_delta), coalesce(v_row.paid_balance, 0), coalesce(v_row.balance, 0));
    if v_remove <= 0 then
      return json_build_object(
        'ok', false,
        'message', 'No paid credits to remove.',
        'balance', v_row.balance,
        'paid_balance', v_row.paid_balance
      );
    end if;
    update public.user_credits
      set balance = balance - v_remove,
          paid_balance = paid_balance - v_remove,
          updated_at = now()
      where user_id = p_user_id
      returning * into v_row;
    v_delta := -v_remove;
  end if;

  insert into public.credit_ledger (user_id, delta, reason, ref)
    values (p_user_id, v_delta, v_reason, coalesce(p_ref, ''))
    returning id into v_ledger_id;

  begin
    perform public.log_credit_transaction(
      p_user_id, v_delta, v_before, v_row.balance,
      v_reason, p_ref, v_ledger_id
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
    'delta', v_delta,
    'requested', p_delta
  );
end;
$$;

revoke all on function public.adjust_paid_credits(uuid, numeric, text, text) from public;
grant execute on function public.adjust_paid_credits(uuid, numeric, text, text) to service_role;
