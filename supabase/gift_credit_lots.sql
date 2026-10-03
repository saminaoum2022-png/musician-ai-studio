-- Gifting v2: included Pro credits are giftable, gifts have a daily cap, and gifts you RECEIVE expire after 30 days.
-- Run AFTER supabase/pro_included_credits.sql (needs user_credits.pro_included_balance). Safe to re-run.
--
-- BEFORE RUNNING — confirm the live send_gift matches supabase/gifts.sql / gifts-promo-giftable-patch.sql
-- (paid + promo giftable, amounts 1/3/5, 20 gifts per hour). In the SQL editor run:
--   select pg_get_functiondef('public.send_gift(uuid,uuid,text,text,numeric)'::regprocedure);
--
-- Rules (Terms: "Gifting", 3 Oct 2026):
--   * Giftable sources, in order: included Pro → paid → promo. Received gifts are never re-giftable.
--   * Max 25 credits per sender per rolling 24h; max 10 credits to the same person per rolling 24h;
--     the existing "20 gifts per hour" limit stays.
--   * Every gift sent from now on lands in the recipient's gift balance as a LOT that expires 30 days
--     after receipt. Gift balance that existed before this migration has no expiry (grandfathered).
--   * Spend order: included Pro → gifts (soonest expiry first, then the grandfathered part) → promo → trial → paid.
--   * Expired lots are removed lazily (every spend, every credits/me read) and by a daily sweep.

begin;

-- ---------- gift lots ---------------------------------------------------------

create table if not exists public.gift_credit_lots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  gift_event_id uuid,
  amount numeric(14, 4) not null check (amount > 0),
  remaining numeric(14, 4) not null check (remaining >= 0),
  received_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists gift_credit_lots_user_expiry_idx
  on public.gift_credit_lots (user_id, expires_at) where remaining > 0;
create index if not exists gift_credit_lots_expiry_idx
  on public.gift_credit_lots (expires_at) where remaining > 0;

create index if not exists gift_events_pair_created_idx
  on public.gift_events (sender_user_id, recipient_user_id, created_at desc);

alter table public.gift_credit_lots enable row level security;
revoke all on table public.gift_credit_lots from anon, authenticated;
grant all on table public.gift_credit_lots to service_role;

-- ---------- expire one user's lapsed lots --------------------------------------

create or replace function public.expire_gift_credit_lots(p_user_id uuid)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.user_credits;
  v_total numeric(14, 4) := 0;
  v_before numeric(14, 4);
  v_ledger_id uuid;
begin
  if not exists (
    select 1 from public.gift_credit_lots
     where user_id = p_user_id and remaining > 0 and expires_at <= now()
  ) then
    return 0;
  end if;

  select * into v_row from public.user_credits where user_id = p_user_id for update;
  if not found then
    return 0;
  end if;

  select coalesce(sum(remaining), 0) into v_total
    from public.gift_credit_lots
   where user_id = p_user_id and remaining > 0 and expires_at <= now();

  update public.gift_credit_lots
     set remaining = 0
   where user_id = p_user_id and remaining > 0 and expires_at <= now();

  -- Never remove more than the gift balance actually holds.
  v_total := least(v_total, coalesce(v_row.gift_balance, 0));
  if v_total <= 0 then
    return 0;
  end if;

  v_before := v_row.balance;
  update public.user_credits
     set gift_balance = gift_balance - v_total,
         balance = balance - v_total,
         updated_at = now()
   where user_id = p_user_id
   returning * into v_row;

  insert into public.credit_ledger (user_id, delta, reason, ref)
    values (p_user_id, -v_total, 'gift_expire', 'gift_lot_expiry')
    returning id into v_ledger_id;
  begin
    perform public.log_credit_transaction(
      p_user_id, -v_total, v_before, v_row.balance, 'gift_expire', 'gift_lot_expiry', v_ledger_id
    );
  exception
    when undefined_function then null;
  end;

  return v_total;
end;
$$;

revoke all on function public.expire_gift_credit_lots(uuid) from public;
grant execute on function public.expire_gift_credit_lots(uuid) to service_role;

-- ---------- daily sweep (cron) ---------------------------------------------------

create or replace function public.expire_all_gift_credit_lots()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_users integer := 0;
  v_credits numeric(14, 4) := 0;
  v_n numeric(14, 4);
begin
  for r in
    select distinct user_id from public.gift_credit_lots
     where remaining > 0 and expires_at <= now()
     limit 2000
  loop
    v_n := public.expire_gift_credit_lots(r.user_id);
    if v_n > 0 then
      v_users := v_users + 1;
      v_credits := v_credits + v_n;
    end if;
  end loop;
  return json_build_object('ok', true, 'users', v_users, 'credits', v_credits);
end;
$$;

revoke all on function public.expire_all_gift_credit_lots() from public;
grant execute on function public.expire_all_gift_credit_lots() to service_role;

-- ---------- spend: included → gifts (soonest expiry first) → promo → trial → paid ---

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
  v_lot record;
  v_left numeric(14, 4);
  v_take numeric(14, 4);
begin
  if p_amount is null or p_amount <= 0 then
    return json_build_object('ok', false, 'status', 'bad_amount', 'message', 'Invalid amount.');
  end if;

  -- Lapsed gift lots must never be spendable.
  perform public.expire_gift_credit_lots(p_user_id);

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
  v_from_paid := v_remaining;

  -- Draw the gift spend from expiring lots first; any rest comes from the grandfathered (non-expiring) part.
  if v_from_gift > 0 then
    v_left := v_from_gift;
    for v_lot in
      select id, remaining
        from public.gift_credit_lots
       where user_id = p_user_id and remaining > 0 and expires_at > now()
       order by expires_at asc, received_at asc
       for update
    loop
      exit when v_left <= 0;
      v_take := least(v_lot.remaining, v_left);
      update public.gift_credit_lots set remaining = remaining - v_take where id = v_lot.id;
      v_left := v_left - v_take;
    end loop;
  end if;

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

-- ---------- send_gift v2 -----------------------------------------------------------

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
  c_daily_cap constant numeric(14, 4) := 25;
  c_pair_cap constant numeric(14, 4) := 10;
  c_hourly_gifts constant integer := 20;
  c_expiry constant interval := interval '30 days';
  v_sender public.user_credits;
  v_recipient public.user_credits;
  v_gift_id uuid;
  v_recent integer;
  v_allowed numeric(14, 4)[];
  v_giftable numeric(14, 4);
  v_sent_24h numeric(14, 4);
  v_pair_24h numeric(14, 4);
  v_from_included numeric(14, 4) := 0;
  v_from_paid numeric(14, 4) := 0;
  v_from_promo numeric(14, 4) := 0;
  v_rem numeric(14, 4);
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

  -- Lock the sender first so concurrent gifts cannot slip past the caps.
  select * into v_sender from public.user_credits where user_id = p_sender_id for update;
  if not found then
    return json_build_object(
      'ok', false, 'status', 'insufficient_giftable',
      'message', 'Not enough credits to gift. Received gift credits cannot be sent.',
      'giftable', 0
    );
  end if;

  select count(*) into v_recent
    from public.gift_events
   where sender_user_id = p_sender_id and created_at > now() - interval '1 hour';
  if v_recent >= c_hourly_gifts then
    return json_build_object('ok', false, 'status', 'rate_limited', 'message', 'Too many gifts — try again later.');
  end if;

  select coalesce(sum(amount), 0) into v_sent_24h
    from public.gift_events
   where sender_user_id = p_sender_id and created_at > now() - interval '24 hours';
  if v_sent_24h + p_amount > c_daily_cap then
    return json_build_object(
      'ok', false, 'status', 'daily_limit',
      'message', 'You have reached today''s gifting limit (' || trim(to_char(c_daily_cap, 'FM999990.####')) || ' credits). Try again tomorrow.',
      'daily_limit', c_daily_cap,
      'sent_24h', v_sent_24h
    );
  end if;

  select coalesce(sum(amount), 0) into v_pair_24h
    from public.gift_events
   where sender_user_id = p_sender_id
     and recipient_user_id = p_recipient_id
     and created_at > now() - interval '24 hours';
  if v_pair_24h + p_amount > c_pair_cap then
    return json_build_object(
      'ok', false, 'status', 'recipient_limit',
      'message', 'You have sent this person the most you can today. Try again tomorrow.',
      'recipient_limit', c_pair_cap,
      'sent_to_recipient_24h', v_pair_24h
    );
  end if;

  v_giftable := coalesce(v_sender.pro_included_balance, 0)
    + coalesce(v_sender.paid_balance, 0)
    + coalesce(v_sender.promo_balance, 0);
  if v_giftable < p_amount then
    return json_build_object(
      'ok', false, 'status', 'insufficient_giftable',
      'message', 'Not enough credits to gift. Received gift credits cannot be sent.',
      'paid_balance', coalesce(v_sender.paid_balance, 0),
      'promo_balance', coalesce(v_sender.promo_balance, 0),
      'pro_included_balance', coalesce(v_sender.pro_included_balance, 0),
      'giftable', v_giftable
    );
  end if;

  -- Draw order: included Pro (it expires anyway) → paid → promo.
  v_rem := p_amount;
  v_from_included := least(coalesce(v_sender.pro_included_balance, 0), v_rem);
  v_rem := v_rem - v_from_included;
  v_from_paid := least(coalesce(v_sender.paid_balance, 0), v_rem);
  v_rem := v_rem - v_from_paid;
  v_from_promo := v_rem;

  select * into v_recipient from public.user_credits where user_id = p_recipient_id for update;
  if not found then
    insert into public.user_credits (user_id, balance, paid_balance, gift_balance, promo_balance, updated_at)
      values (p_recipient_id, 0, 0, 0, 0, now())
      returning * into v_recipient;
  end if;

  update public.user_credits
    set balance = balance - p_amount,
        pro_included_balance = pro_included_balance - v_from_included,
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

  insert into public.gift_credit_lots (user_id, gift_event_id, amount, remaining, received_at, expires_at)
    values (p_recipient_id, v_gift_id, p_amount, p_amount, now(), now() + c_expiry);

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
    'sender_pro_included_balance', v_sender.pro_included_balance,
    'giftable', coalesce(v_sender.pro_included_balance, 0)
      + coalesce(v_sender.paid_balance, 0)
      + coalesce(v_sender.promo_balance, 0),
    'sent_24h', v_sent_24h + p_amount,
    'daily_limit', c_daily_cap,
    'recipient_balance', v_recipient.balance,
    'recipient_gift_balance', v_recipient.gift_balance
  );
end;
$$;

revoke all on function public.send_gift(uuid, uuid, text, text, numeric) from public;
grant execute on function public.send_gift(uuid, uuid, text, text, numeric) to service_role;

-- ---------- admin visibility: repeated gifting between the same two accounts ---------

create or replace view public.gift_pair_flow_7d as
select
  sender_user_id,
  recipient_user_id,
  count(*)::int      as gifts,
  sum(amount)        as credits,
  max(created_at)    as last_gift_at
from public.gift_events
where created_at > now() - interval '7 days'
group by sender_user_id, recipient_user_id
having sum(amount) >= 30;

revoke all on public.gift_pair_flow_7d from anon, authenticated;
grant select on public.gift_pair_flow_7d to service_role;

commit;
