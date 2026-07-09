-- Billing idempotency + helpers for Apple/RevenueCat subscription webhooks.
-- Run in Supabase SQL Editor after pro_subscriptions.sql.

create table if not exists public.billing_events (
  id text primary key,
  user_id uuid references auth.users (id) on delete set null,
  provider text not null,
  event_type text not null default '',
  plan_id text,
  product_id text,
  credits_granted numeric(14, 4) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists billing_events_user_idx
  on public.billing_events (user_id, created_at desc);

alter table public.billing_events enable row level security;

comment on table public.billing_events is
  'Processed billing transaction/event ids — prevents double credit grants on webhook retries.';
