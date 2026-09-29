-- List current monthly Pro subscribers (for grandfather allowlist).
-- Run in Supabase SQL editor (shared staging/production DB).

select
  s.user_id,
  p.email,
  p.username,
  s.status,
  s.provider,
  s.created_at,
  s.current_period_end
from public.pro_subscriptions s
left join public.profiles p on p.user_id = s.user_id
where s.plan_id = 'monthly'
  and s.status in ('active', 'trialing', 'grace')
order by s.created_at asc;
