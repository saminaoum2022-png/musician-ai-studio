-- READ-ONLY preview: how every Pro user will be classified by supabase/pro_included_credits.sql.
-- Safe to run before the migration (does not reference the new columns). Changes nothing.
--
--   proposed_policy = 'refresh'  → included credits reset each billing period from now
--   proposed_policy = 'stack'    → grandfathered: keeps stacking until first renewal on/after 1 Nov 2026,
--                                   existing balance is never wiped
--
-- Rule used by the migration: status 'trialing' → refresh; every other existing row → stack.
-- Team / test accounts you want on the new rule: see the optional UPDATE at the bottom.

select
  u.email,
  p.plan_id,
  p.status,
  case when p.status = 'trialing' then 'refresh' else 'stack' end as proposed_policy,
  p.provider,
  p.created_at::date            as sub_created,
  p.current_period_end::date    as period_end,
  c.balance,
  c.paid_balance,
  c.gift_balance,
  c.promo_balance,
  c.trial_balance
from public.pro_subscriptions p
join auth.users u on u.id = p.user_id
left join public.user_credits c on c.user_id = p.user_id
order by (p.status = 'trialing') desc, p.status, p.created_at;

-- OPTIONAL — run AFTER pro_included_credits.sql: put your own team/test accounts on the new rule.
-- Replace the emails, then run.
--
-- update public.pro_subscriptions
--    set credit_policy = 'refresh'
--  where user_id in (select id from auth.users where lower(email) in (
--    'you@example.com', 'teammate@example.com'
--  ));
