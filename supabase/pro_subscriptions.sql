-- NabadAi Pro subscription state (Apple IAP / future providers).
-- Run in Supabase SQL Editor before enabling IAP webhooks.
-- UI hides the Profile Pro banner while status is active, trialing, or grace.

create table if not exists public.pro_subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  provider text not null default 'apple',
  plan_id text not null,
  status text not null default 'active',
  current_period_end timestamptz,
  provider_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pro_subscriptions_provider_check
    check (provider in ('apple', 'stripe', 'revenuecat')),
  constraint pro_subscriptions_plan_check
    check (plan_id in ('weekly', 'monthly')),
  constraint pro_subscriptions_status_check
    check (status in ('active', 'trialing', 'grace', 'cancelled', 'expired'))
);

create index if not exists pro_subscriptions_status_idx
  on public.pro_subscriptions (status, current_period_end desc);

alter table public.pro_subscriptions enable row level security;

comment on table public.pro_subscriptions is
  'Provider-neutral Pro subscription row per user. Written by IAP webhooks; read by API for gating UI.';
