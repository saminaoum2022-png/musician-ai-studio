-- Optional: log admin/IAP paid grants in credits_transactions (admin dashboard ledger).
-- Run once in Supabase SQL Editor if grants still missing from Credits tab after API deploy.
-- Safe to re-run: replaces grant_paid_credits only.

create or replace function public.grant_paid_credits(
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
begin
  if p_amount is null or p_amount <= 0 then
    return json_build_object('ok', false, 'message', 'Invalid amount.');
  end if;

  select balance into v_before from public.user_credits where user_id = p_user_id;
  if not found then
    v_before := 0;
  end if;

  insert into public.user_credits (user_id, balance, paid_balance, gift_balance, promo_balance, updated_at)
    values (p_user_id, p_amount, p_amount, 0, 0, now())
    on conflict (user_id) do update
      set balance = public.user_credits.balance + excluded.balance,
          paid_balance = public.user_credits.paid_balance + p_amount,
          updated_at = now()
    returning * into v_row;

  insert into public.credit_ledger (user_id, delta, reason, ref)
    values (p_user_id, p_amount, 'paid_purchase', coalesce(p_ref, ''))
    returning id into v_ledger_id;

  begin
    perform public.log_credit_transaction(
      p_user_id, p_amount, coalesce(v_before, 0), v_row.balance,
      'paid_purchase', p_ref, v_ledger_id
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
    'granted', p_amount
  );
end;
$$;
