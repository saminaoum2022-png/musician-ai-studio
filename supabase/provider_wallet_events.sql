-- Provider wallet events — manual top-ups / adjustments for vendor API spend tracking.
-- Run on production Supabase before using admin "Log top-up" (shared DB today).
--
-- Consumption: music_generation_logs (Suno/Lyria/ElevenLabs) + provider_usage_events (Gemini/Pollinations).

create table if not exists public.provider_wallet_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_type text not null default 'top_up',
  amount_usd numeric(12, 6),
  amount_credits numeric(14, 4),
  note text,
  logged_by uuid references auth.users (id) on delete set null,
  logged_by_email text,
  created_at timestamptz not null default now(),
  constraint provider_wallet_events_provider_check check (
    provider in ('suno', 'lyria', 'elevenlabs', 'gemini', 'pollinations', 'minimax', 'other')
  ),
  constraint provider_wallet_events_type_check check (
    event_type in ('top_up', 'adjustment', 'balance_snapshot')
  ),
  constraint provider_wallet_events_amount_check check (
    amount_usd is not null or amount_credits is not null
  )
);

create index if not exists provider_wallet_events_provider_created_idx
  on public.provider_wallet_events (provider, created_at desc);

alter table public.provider_wallet_events enable row level security;

drop policy if exists "provider_wallet_events_admin_select" on public.provider_wallet_events;
create policy "provider_wallet_events_admin_select"
  on public.provider_wallet_events for select
  using (public.is_admin_user(auth.uid()));

drop policy if exists "provider_wallet_events_admin_insert" on public.provider_wallet_events;
create policy "provider_wallet_events_admin_insert"
  on public.provider_wallet_events for insert
  with check (public.is_admin_user(auth.uid()));

-- Non-music API calls (Gemini coach, Pollinations covers, etc.)
create table if not exists public.provider_usage_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  kind text not null default 'request',
  amount_usd numeric(12, 6) not null default 0,
  user_id uuid references auth.users (id) on delete set null,
  status text not null default 'completed',
  ref text,
  created_at timestamptz not null default now(),
  constraint provider_usage_events_provider_check check (
    provider in ('suno', 'lyria', 'elevenlabs', 'gemini', 'pollinations', 'minimax', 'other')
  ),
  constraint provider_usage_events_status_check check (
    status in ('completed', 'failed')
  )
);

create index if not exists provider_usage_events_provider_created_idx
  on public.provider_usage_events (provider, created_at desc);

alter table public.provider_usage_events enable row level security;

drop policy if exists "provider_usage_events_admin_select" on public.provider_usage_events;
create policy "provider_usage_events_admin_select"
  on public.provider_usage_events for select
  using (public.is_admin_user(auth.uid()));

create or replace function public.get_provider_spend_summary()
returns table (
  provider text,
  consumed_usd_today numeric,
  consumed_usd_7d numeric,
  consumed_usd_30d numeric,
  consumed_usd_all numeric,
  generations_30d bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with events as (
    select
      lower(coalesce(m.provider, 'other')) as provider,
      coalesce(m.provider_cost_usd, 0)::numeric(12, 6) as amount_usd,
      m.created_at,
      true as is_generation
    from public.music_generation_logs m
    where m.status is distinct from 'refunded'
    union all
    select
      lower(u.provider) as provider,
      coalesce(u.amount_usd, 0)::numeric(12, 6) as amount_usd,
      u.created_at,
      false as is_generation
    from public.provider_usage_events u
    where u.status = 'completed'
  )
  select
    provider,
    coalesce(sum(
      case when created_at >= date_trunc('day', now() at time zone 'utc')
        then amount_usd else 0 end
    ), 0)::numeric(12, 6) as consumed_usd_today,
    coalesce(sum(
      case when created_at >= now() - interval '7 days'
        then amount_usd else 0 end
    ), 0)::numeric(12, 6) as consumed_usd_7d,
    coalesce(sum(
      case when created_at >= now() - interval '30 days'
        then amount_usd else 0 end
    ), 0)::numeric(12, 6) as consumed_usd_30d,
    coalesce(sum(amount_usd), 0)::numeric(12, 6) as consumed_usd_all,
    count(*) filter (
      where is_generation and created_at >= now() - interval '30 days'
    )::bigint as generations_30d
  from events
  group by provider;
$$;

create or replace function public.get_provider_top_up_summary()
returns table (
  provider text,
  topped_up_usd numeric,
  topped_up_credits numeric,
  top_up_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    lower(provider) as provider,
    coalesce(sum(coalesce(amount_usd, 0)), 0)::numeric(12, 6) as topped_up_usd,
    coalesce(sum(coalesce(amount_credits, 0)), 0)::numeric(14, 4) as topped_up_credits,
    count(*)::bigint as top_up_count
  from public.provider_wallet_events
  where event_type in ('top_up', 'adjustment')
  group by 1;
$$;

-- If table already exists, widen event_type for balance snapshots:
-- alter table public.provider_wallet_events drop constraint if exists provider_wallet_events_type_check;
-- alter table public.provider_wallet_events add constraint provider_wallet_events_type_check
--   check (event_type in ('top_up', 'adjustment', 'balance_snapshot'));
