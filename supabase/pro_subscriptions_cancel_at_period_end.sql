-- Mirror Stripe cancel_at_period_end (and similar) on pro_subscriptions.
-- Run in Supabase SQL Editor.

alter table public.pro_subscriptions
  add column if not exists cancel_at_period_end boolean not null default false;

comment on column public.pro_subscriptions.cancel_at_period_end is
  'True when subscription is set to cancel at current_period_end (Stripe portal). Pro access continues until then.';

create index if not exists pro_subscriptions_cancel_pending_idx
  on public.pro_subscriptions (cancel_at_period_end, current_period_end desc)
  where cancel_at_period_end = true;
