-- OneSignal web/native push subscription IDs linked to authenticated users.
-- Stores only the OneSignal subscription/player ID + platform — no message content.
-- All notification copy is generic; message bodies stay in Supabase.

create table if not exists public.user_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  onesignal_subscription_id text not null,
  platform text not null default 'web',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_push_subscriptions_platform_check
    check (platform in ('web', 'ios', 'android')),
  constraint user_push_subscriptions_subscription_id_len
    check (char_length(onesignal_subscription_id) between 8 and 120)
);

create unique index if not exists user_push_subscriptions_user_sub_uq
  on public.user_push_subscriptions (user_id, onesignal_subscription_id);

create index if not exists user_push_subscriptions_user_idx
  on public.user_push_subscriptions (user_id, updated_at desc);

alter table public.user_push_subscriptions enable row level security;

comment on table public.user_push_subscriptions is
  'OneSignal subscription IDs for push delivery. No PII or message content — generic alerts only.';
