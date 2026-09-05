-- Product funnel analytics for admin Web funnel tab + Vercel custom events mirror.
-- Run in Supabase SQL Editor (shared production DB).

create table if not exists public.product_analytics_events (
  id bigint generated always as identity primary key,
  event_name text not null check (char_length(event_name) <= 128),
  event_data jsonb not null default '{}'::jsonb,
  page_path text,
  source text not null default 'web',
  created_at timestamptz not null default now()
);

create index if not exists product_analytics_events_created_at_idx
  on public.product_analytics_events (created_at desc);

create index if not exists product_analytics_events_name_created_idx
  on public.product_analytics_events (event_name, created_at desc);

alter table public.product_analytics_events enable row level security;

comment on table public.product_analytics_events is
  'Allowlisted product funnel events from web/app (no PII). Admin reads via service role RPC.';

create or replace function public.get_admin_web_funnel_summary(p_days int default 28)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_days int := greatest(7, least(90, coalesce(p_days, 28)));
  v_start timestamptz := date_trunc('day', now() at time zone 'utc')
    - ((v_days - 1) || ' days')::interval;
  v_today timestamptz := date_trunc('day', now() at time zone 'utc');
begin
  return jsonb_build_object(
    'days', v_days,
    'totals',
      coalesce((
        select jsonb_object_agg(event_name, cnt)
        from (
          select event_name, count(*)::bigint as cnt
          from public.product_analytics_events
          where created_at >= v_start
          group by event_name
        ) t
      ), '{}'::jsonb),
    'totalsToday',
      coalesce((
        select jsonb_object_agg(event_name, cnt)
        from (
          select event_name, count(*)::bigint as cnt
          from public.product_analytics_events
          where created_at >= v_today
          group by event_name
        ) t
      ), '{}'::jsonb),
    'daily',
      coalesce((
        with day_series as (
          select (v_today::date - offs)::text as day
          from generate_series(0, v_days - 1) as offs
        ),
        day_counts as (
          select (created_at at time zone 'utc')::date::text as day,
                 event_name,
                 count(*)::bigint as cnt
          from public.product_analytics_events
          where created_at >= v_start
          group by 1, 2
        ),
        pivoted as (
          select day,
                 jsonb_object_agg(event_name, cnt) as events
          from day_counts
          group by day
        )
        select jsonb_agg(
          jsonb_build_object(
            'day', ds.day,
            'events', coalesce(p.events, '{}'::jsonb)
          )
          order by ds.day asc
        )
        from day_series ds
        left join pivoted p on p.day = ds.day
      ), '[]'::jsonb),
    'breakdowns',
      coalesce((
        select jsonb_object_agg(event_name, dims)
        from (
          select event_name,
                 jsonb_object_agg(coalesce(event_data->>'method', event_data->>'page', event_data->>'route', event_data->>'placement', event_data->>'path', 'other'), cnt) as dims
          from (
            select event_name,
                   coalesce(event_data->>'method', event_data->>'page', event_data->>'route', event_data->>'placement', event_data->>'path') as dim_key,
                   count(*)::bigint as cnt
            from public.product_analytics_events
            where created_at >= v_start
              and event_name in (
                'nabad_signup_complete', 'nabad_signin_complete', 'nabad_cta_click',
                'nabad_route_view', 'nabad_song_plan_start', 'nabad_blog_cta_click'
              )
            group by 1, 2
          ) x
          group by event_name
        ) b
      ), '{}'::jsonb)
  );
end;
$$;

revoke all on function public.get_admin_web_funnel_summary(int) from public;
grant execute on function public.get_admin_web_funnel_summary(int) to service_role;
