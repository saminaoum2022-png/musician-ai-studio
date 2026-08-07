-- Promo credit grants (signup welcome, admin promo grants, etc.)
-- Run in Supabase SQL Editor AFTER gifts.sql / bucket columns exist.
--
-- signup_welcome should credit promo_balance so Credits page breakdown + ledger stay accurate.

create or replace function public.grant_promo_credits(
  p_user_id uuid,
  p_amount numeric(14, 4),
  p_reason text default 'promo_grant',
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
    values (p_user_id, p_amount, 0, 0, p_amount, now())
    on conflict (user_id) do update
      set balance = public.user_credits.balance + excluded.balance,
          promo_balance = public.user_credits.promo_balance + p_amount,
          updated_at = now()
    returning * into v_row;

  insert into public.credit_ledger (user_id, delta, reason, ref)
    values (p_user_id, p_amount, coalesce(nullif(trim(p_reason), ''), 'promo_grant'), coalesce(p_ref, ''))
    returning id into v_ledger_id;

  begin
    perform public.log_credit_transaction(
      p_user_id, p_amount, coalesce(v_before, 0), v_row.balance,
      coalesce(nullif(trim(p_reason), ''), 'promo_grant'), p_ref, v_ledger_id
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

revoke all on function public.grant_promo_credits(uuid, numeric, text, text) from public;
grant execute on function public.grant_promo_credits(uuid, numeric, text, text) to service_role;

-- One-time backfill: past signup_welcome grants that only bumped total balance.
update public.user_credits uc
set
  promo_balance = uc.promo_balance + w.welcome_amt,
  updated_at = now()
from (
  select user_id, sum(delta)::numeric(14, 4) as welcome_amt
  from public.credit_ledger
  where reason = 'signup_welcome' and delta > 0
  group by user_id
) w
where uc.user_id = w.user_id
  and uc.promo_balance = 0
  and uc.paid_balance = 0
  and uc.gift_balance = 0
  and uc.balance >= w.welcome_amt;
