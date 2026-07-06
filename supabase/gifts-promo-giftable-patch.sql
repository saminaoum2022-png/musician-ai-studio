-- Patch: allow gifting from paid + promo (testing). Never debit gift_balance.
-- Run in Supabase SQL Editor if gifts.sql was already applied with paid-only send_gift.

begin;

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
