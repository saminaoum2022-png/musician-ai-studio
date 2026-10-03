-- Trial leftovers join the FIRST paid period's included credits (so they refresh away at the next
-- renewal) instead of becoming permanent "saved" credits.
--
-- Run AFTER supabase/pro_included_credits.sql. Safe to run on its own: it only adds a function and
-- changes no balances. Until the API that calls it is deployed, nothing uses it.
--
-- The API calls this right AFTER grant_pro_period_credits on the first paid period of a trial
-- (refresh policy only). The next renewal's grant_pro_period_credits resets included credits, so any
-- trial leftover that was not spent simply goes with the rest of that period's allowance.
-- If this function is missing, the API falls back to the old behaviour (move into saved credits).

begin;

create or replace function public.convert_trial_credits_to_included(
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
  v_ledger_id uuid;
begin
  select * into v_row from public.user_credits where user_id = p_user_id for update;
  if not found then
    return json_build_object('ok', true, 'converted', 0, 'balance', 0, 'pro_included_balance', 0);
  end if;

  v_move := coalesce(v_row.trial_balance, 0);
  if v_move <= 0 then
    return json_build_object(
      'ok', true, 'converted', 0,
      'balance', v_row.balance, 'pro_included_balance', coalesce(v_row.pro_included_balance, 0)
    );
  end if;

  -- balance is unchanged: credits only move between buckets.
  update public.user_credits
     set pro_included_balance = pro_included_balance + v_move,
         trial_balance = 0,
         updated_at = now()
   where user_id = p_user_id
   returning * into v_row;

  insert into public.credit_ledger (user_id, delta, reason, ref)
    values (p_user_id, 0, 'trial_convert_included', coalesce(p_ref, ''))
    returning id into v_ledger_id;
  begin
    perform public.log_credit_transaction(
      p_user_id, 0, v_row.balance, v_row.balance, 'trial_convert_included', p_ref, v_ledger_id
    );
  exception
    when undefined_function then null;
  end;

  return json_build_object(
    'ok', true,
    'converted', v_move,
    'balance', v_row.balance,
    'pro_included_balance', v_row.pro_included_balance,
    'trial_balance', v_row.trial_balance
  );
end;
$$;

revoke all on function public.convert_trial_credits_to_included(uuid, text) from public;
grant execute on function public.convert_trial_credits_to_included(uuid, text) to service_role;

commit;
