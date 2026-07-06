-- Gifts + credit buckets (paid / gift / promo).
-- Run in Supabase SQL Editor AFTER credits_decimal.sql.
--
-- Rules:
--   paid_balance   — purchased / admin-granted; can gift + generate
--   gift_balance   — received from others; generate only (never re-giftable)
--   promo_balance  — promo codes; giftable for testing + generate (never re-gift received gifts)
--   balance        — total (paid + gift + promo), kept in sync

begin;

alter table public.user_credits
  add column if not exists paid_balance numeric(14, 4) not null default 0 check (paid_balance >= 0),
  add column if not exists gift_balance numeric(14, 4) not null default 0 check (gift_balance >= 0),
  add column if not exists promo_balance numeric(14, 4) not null default 0 check (promo_balance >= 0);

-- One-time migration: existing balances were promo/grant codes, not paid.
update public.user_credits
set
  promo_balance = balance,
  paid_balance = 0,
  gift_balance = 0
where paid_balance = 0
  and gift_balance = 0
  and promo_balance = 0
  and balance > 0;

create table if not exists public.gift_events (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references auth.users (id) on delete cascade,
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  target_kind text not null check (target_kind in ('song', 'status')),
  target_id text not null,
  amount numeric(14, 4) not null check (amount > 0),
  created_at timestamptz not null default now()
);

create index if not exists gift_events_sender_created_idx
  on public.gift_events (sender_user_id, created_at desc);

create index if not exists gift_events_recipient_created_idx
  on public.gift_events (recipient_user_id, created_at desc);

create index if not exists gift_events_target_idx
  on public.gift_events (target_kind, target_id);

alter table public.gift_events enable row level security;

drop policy if exists "gift_events_select_involved" on public.gift_events;
create policy "gift_events_select_involved"
  on public.gift_events for select
  using (auth.uid() = sender_user_id or auth.uid() = recipient_user_id);

-- ---------- bucket-aware promo redeem ---------------------------------

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
  v_row public.user_credits;
begin
  select * into v_existing
    from public.promo_redemptions
    where code = p_code and user_id = p_user_id
    for update;

  if found then
    select * into v_row from public.user_credits where user_id = p_user_id;
    return json_build_object(
      'ok', true,
      'status', 'already_redeemed',
      'balance', coalesce(v_row.balance, 0),
      'paid_balance', coalesce(v_row.paid_balance, 0),
      'gift_balance', coalesce(v_row.gift_balance, 0),
      'promo_balance', coalesce(v_row.promo_balance, 0),
      'credits_added', 0,
      'message', 'You already redeemed this code.'
    );
  end if;

  select * into v_code from public.promo_codes where code = p_code for update;

  if not found then
    return json_build_object('ok', false, 'status', 'invalid_code', 'message', 'Code not found.');
  end if;

  if not v_code.active then
    return json_build_object('ok', false, 'status', 'inactive_code', 'message', 'Code is no longer active.');
  end if;

  if v_code.expires_at is not null and v_code.expires_at < now() then
    return json_build_object('ok', false, 'status', 'inactive_code', 'message', 'Code has expired.');
  end if;

  if v_code.redemptions >= v_code.max_redemptions then
    return json_build_object('ok', false, 'status', 'exhausted_code', 'message', 'Code has been fully used.');
  end if;

  insert into public.promo_redemptions (code, user_id, credits)
    values (p_code, p_user_id, v_code.credits);

  update public.promo_codes set redemptions = redemptions + 1 where code = p_code;

  insert into public.user_credits (user_id, balance, paid_balance, gift_balance, promo_balance, updated_at)
    values (p_user_id, v_code.credits, 0, 0, v_code.credits, now())
    on conflict (user_id) do update
      set balance = public.user_credits.balance + excluded.balance,
          promo_balance = public.user_credits.promo_balance + v_code.credits,
          updated_at = now()
    returning * into v_row;

  insert into public.credit_ledger (user_id, delta, reason, ref)
    values (p_user_id, v_code.credits, 'promo_redeem', p_code);

  return json_build_object(
    'ok', true,
    'status', 'redeemed',
    'balance', v_row.balance,
    'paid_balance', v_row.paid_balance,
    'gift_balance', v_row.gift_balance,
    'promo_balance', v_row.promo_balance,
    'credits_added', v_code.credits,
    'message', 'Redeemed successfully.'
  );
end;
$$;

-- ---------- spend: gift → promo → paid --------------------------------

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
  v_from_paid numeric(14, 4) := 0;
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
  v_from_gift := least(v_row.gift_balance, v_remaining);
  v_remaining := v_remaining - v_from_gift;
  v_from_promo := least(v_row.promo_balance, v_remaining);
  v_remaining := v_remaining - v_from_promo;
  v_from_paid := v_remaining;

  update public.user_credits
    set balance = balance - p_amount,
        gift_balance = gift_balance - v_from_gift,
        promo_balance = promo_balance - v_from_promo,
        paid_balance = paid_balance - v_from_paid,
        updated_at = now()
    where user_id = p_user_id
    returning * into v_row;

  insert into public.credit_ledger (user_id, delta, reason, ref)
    values (p_user_id, -p_amount, p_reason, coalesce(p_ref, ''));

  return json_build_object(
    'ok', true, 'status', 'spent',
    'balance', v_row.balance,
    'paid_balance', v_row.paid_balance,
    'gift_balance', v_row.gift_balance,
    'promo_balance', v_row.promo_balance,
    'spent', p_amount
  );
end;
$$;

-- Refunds go back to promo bucket (safe default for failed generations).
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
  v_row public.user_credits;
begin
  if p_amount is null or p_amount <= 0 then
    return json_build_object('ok', false, 'message', 'Invalid amount.');
  end if;

  insert into public.user_credits (user_id, balance, paid_balance, gift_balance, promo_balance, updated_at)
    values (p_user_id, p_amount, 0, 0, p_amount, now())
    on conflict (user_id) do update
      set balance = public.user_credits.balance + excluded.balance,
          promo_balance = public.user_credits.promo_balance + p_amount,
          updated_at = now()
    returning * into v_row;

  insert into public.credit_ledger (user_id, delta, reason, ref)
    values (p_user_id, p_amount, p_reason, coalesce(p_ref, ''));

  return json_build_object(
    'ok', true,
    'balance', v_row.balance,
    'paid_balance', v_row.paid_balance,
    'gift_balance', v_row.gift_balance,
    'promo_balance', v_row.promo_balance,
    'refunded', p_amount
  );
end;
$$;

-- Admin / future IAP: add paid credits only.
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
begin
  if p_amount is null or p_amount <= 0 then
    return json_build_object('ok', false, 'message', 'Invalid amount.');
  end if;

  insert into public.user_credits (user_id, balance, paid_balance, gift_balance, promo_balance, updated_at)
    values (p_user_id, p_amount, p_amount, 0, 0, now())
    on conflict (user_id) do update
      set balance = public.user_credits.balance + excluded.balance,
          paid_balance = public.user_credits.paid_balance + p_amount,
          updated_at = now()
    returning * into v_row;

  insert into public.credit_ledger (user_id, delta, reason, ref)
    values (p_user_id, p_amount, 'paid_purchase', coalesce(p_ref, ''));

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

-- Send gift: paid + promo can be sent (testing); gift_balance never sent. Recipient gets gift_balance.
create or replace function public.send_gift(
  p_sender_id uuid,
  p_recipient_id uuid,
  p_target_kind text,
  p_target_id text,
  p_amount numeric(14, 4)
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender public.user_credits;
  v_recipient public.user_credits;
  v_gift_id uuid;
  v_recent integer;
  v_allowed numeric(14, 4)[];
  v_giftable numeric(14, 4);
  v_from_paid numeric(14, 4) := 0;
  v_from_promo numeric(14, 4) := 0;
begin
  if p_sender_id is null or p_recipient_id is null then
    return json_build_object('ok', false, 'status', 'bad_request', 'message', 'Missing users.');
  end if;

  if p_sender_id = p_recipient_id then
    return json_build_object('ok', false, 'status', 'self_gift', 'message', 'You cannot gift yourself.');
  end if;

  if p_target_kind not in ('song', 'status') then
    return json_build_object('ok', false, 'status', 'bad_request', 'message', 'Invalid target.');
  end if;

  v_allowed := array[1::numeric, 3::numeric, 5::numeric];
  if p_amount is null or not (p_amount = any (v_allowed)) then
    return json_build_object('ok', false, 'status', 'bad_amount', 'message', 'Choose 1, 3, or 5 credits.');
  end if;

  select count(*) into v_recent
    from public.gift_events
    where sender_user_id = p_sender_id
      and created_at > now() - interval '1 hour';

  if v_recent >= 20 then
    return json_build_object('ok', false, 'status', 'rate_limited', 'message', 'Too many gifts — try again later.');
  end if;

  select * into v_sender from public.user_credits where user_id = p_sender_id for update;
  v_giftable := coalesce(v_sender.paid_balance, 0) + coalesce(v_sender.promo_balance, 0);
  if not found or v_giftable < p_amount then
    return json_build_object(
      'ok', false,
      'status', 'insufficient_giftable',
      'message', 'Not enough credits to gift. Paid and promo credits can be sent — received gift credits cannot.',
      'paid_balance', coalesce(v_sender.paid_balance, 0),
      'promo_balance', coalesce(v_sender.promo_balance, 0),
      'giftable', v_giftable
    );
  end if;

  v_from_paid := least(coalesce(v_sender.paid_balance, 0), p_amount);
  v_from_promo := p_amount - v_from_paid;

  select * into v_recipient from public.user_credits where user_id = p_recipient_id for update;
  if not found then
    insert into public.user_credits (user_id, balance, paid_balance, gift_balance, promo_balance, updated_at)
      values (p_recipient_id, 0, 0, 0, 0, now())
      returning * into v_recipient;
  end if;

  update public.user_credits
    set balance = balance - p_amount,
        paid_balance = paid_balance - v_from_paid,
        promo_balance = promo_balance - v_from_promo,
        updated_at = now()
    where user_id = p_sender_id
    returning * into v_sender;

  update public.user_credits
    set balance = balance + p_amount,
        gift_balance = gift_balance + p_amount,
        updated_at = now()
    where user_id = p_recipient_id
    returning * into v_recipient;

  insert into public.gift_events (sender_user_id, recipient_user_id, target_kind, target_id, amount)
    values (p_sender_id, p_recipient_id, p_target_kind, p_target_id, p_amount)
    returning id into v_gift_id;

  insert into public.credit_ledger (user_id, delta, reason, ref)
    values
      (p_sender_id, -p_amount, 'gift_sent', v_gift_id::text),
      (p_recipient_id, p_amount, 'gift_received', v_gift_id::text);

  return json_build_object(
    'ok', true,
    'status', 'sent',
    'gift_id', v_gift_id,
    'amount', p_amount,
    'sender_balance', v_sender.balance,
    'sender_paid_balance', v_sender.paid_balance,
    'sender_promo_balance', v_sender.promo_balance,
    'giftable', coalesce(v_sender.paid_balance, 0) + coalesce(v_sender.promo_balance, 0),
    'recipient_balance', v_recipient.balance,
    'recipient_gift_balance', v_recipient.gift_balance
  );
end;
$$;

revoke all on function public.send_gift(uuid, uuid, text, text, numeric) from public;
grant execute on function public.send_gift(uuid, uuid, text, text, numeric) to service_role;

commit;
