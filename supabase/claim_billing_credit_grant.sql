-- Atomic idempotency for subscription / IAP credit grants.
-- Run once in Supabase SQL Editor (production + any staging project).
--
-- Fixes double trial grants when Stripe checkout, invoice.paid, and /api/billing/sync
-- race or when billing_events insert fails after credits were already granted.

-- 1) Claim an event id BEFORE granting credits (INSERT … ON CONFLICT DO NOTHING).
create or replace function public.claim_billing_event(
  p_event_id text,
  p_user_id uuid,
  p_provider text,
  p_event_type text default '',
  p_plan_id text default null,
  p_product_id text default null
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text;
begin
  if coalesce(trim(p_event_id), '') = '' then
    return json_build_object('ok', false, 'message', 'Missing event id.');
  end if;

  insert into public.billing_events (
    id, user_id, provider, event_type, plan_id, product_id, credits_granted
  )
  values (
    trim(p_event_id),
    p_user_id,
    coalesce(nullif(trim(p_provider), ''), 'unknown'),
    coalesce(p_event_type, ''),
    p_plan_id,
    p_product_id,
    0
  )
  on conflict (id) do nothing
  returning id into v_id;

  if v_id is null then
    return json_build_object('ok', true, 'claimed', false, 'duplicate', true);
  end if;

  return json_build_object('ok', true, 'claimed', true);
end;
$$;

revoke all on function public.claim_billing_event(text, uuid, text, text, text, text) from public;
grant execute on function public.claim_billing_event(text, uuid, text, text, text, text) to service_role;

-- 2) Mark credits granted after a successful RPC grant (or release claim on failure).
create or replace function public.complete_billing_event_grant(
  p_event_id text,
  p_credits_granted numeric
) returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(trim(p_event_id), '') = '' then
    return json_build_object('ok', false, 'message', 'Missing event id.');
  end if;

  update public.billing_events
     set credits_granted = greatest(coalesce(p_credits_granted, 0), 0)
   where id = trim(p_event_id);

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.complete_billing_event_grant(text, numeric) from public;
grant execute on function public.complete_billing_event_grant(text, numeric) to service_role;

create or replace function public.release_billing_event_claim(p_event_id text) returns json
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(trim(p_event_id), '') = '' then
    return json_build_object('ok', false, 'message', 'Missing event id.');
  end if;

  delete from public.billing_events
   where id = trim(p_event_id)
     and credits_granted = 0;

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.release_billing_event_claim(text) from public;
grant execute on function public.release_billing_event_claim(text) to service_role;

-- 3) Belt-and-suspenders: never double-grant the same paid ref on the ledger.
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
         and reason = 'paid_purchase'
         and ref = v_ref
    ) then
      select balance into v_before from public.user_credits where user_id = p_user_id;
      if not found then
        v_before := 0;
      end if;
      return json_build_object(
        'ok', true,
        'duplicate', true,
        'balance', coalesce(v_before, 0),
        'granted', 0
      );
    end if;
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
    values (p_user_id, p_amount, 'paid_purchase', v_ref)
    returning id into v_ledger_id;

  begin
    perform public.log_credit_transaction(
      p_user_id, p_amount, coalesce(v_before, 0), v_row.balance,
      'paid_purchase', v_ref, v_ledger_id
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

revoke all on function public.grant_paid_credits(uuid, numeric, text) from public;
grant execute on function public.grant_paid_credits(uuid, numeric, text) to service_role;
