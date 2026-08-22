-- NabadAi Coach usage analytics (privacy-safe — counts only, no message content).
-- Run in Supabase SQL Editor (production / shared DB).
--
-- Data source: provider_usage_events where kind = 'coach' (logged on each successful
-- /api/coach reply). Message text is never stored.

create index if not exists provider_usage_events_kind_created_idx
  on public.provider_usage_events (kind, created_at desc)
  where kind = 'coach';

create or replace function public.get_coach_usage_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today timestamptz := date_trunc('day', now() at time zone 'utc');
  v_d7 timestamptz := now() - interval '7 days';
  v_d30 timestamptz := now() - interval '30 days';
begin
  return jsonb_build_object(
    'messagesToday',
      (select count(*)::bigint from public.provider_usage_events
       where kind = 'coach' and status = 'completed' and created_at >= v_today),
    'messages7d',
      (select count(*)::bigint from public.provider_usage_events
       where kind = 'coach' and status = 'completed' and created_at >= v_d7),
    'messages30d',
      (select count(*)::bigint from public.provider_usage_events
       where kind = 'coach' and status = 'completed' and created_at >= v_d30),
    'messagesAll',
      (select count(*)::bigint from public.provider_usage_events
       where kind = 'coach' and status = 'completed'),
    'uniqueUsersToday',
      (select count(distinct user_id)::bigint from public.provider_usage_events
       where kind = 'coach' and status = 'completed' and created_at >= v_today and user_id is not null),
    'uniqueUsers7d',
      (select count(distinct user_id)::bigint from public.provider_usage_events
       where kind = 'coach' and status = 'completed' and created_at >= v_d7 and user_id is not null),
    'uniqueUsers30d',
      (select count(distinct user_id)::bigint from public.provider_usage_events
       where kind = 'coach' and status = 'completed' and created_at >= v_d30 and user_id is not null),
    'uniqueUsersAll',
      (select count(distinct user_id)::bigint from public.provider_usage_events
       where kind = 'coach' and status = 'completed' and user_id is not null),
    'estCostUsd30d',
      coalesce((
        select sum(coalesce(amount_usd, 0))::numeric(12, 6)
        from public.provider_usage_events
        where kind = 'coach' and status = 'completed' and created_at >= v_d30
      ), 0),
    'daily',
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'day', d.day,
            'messages', d.messages,
            'users', d.users
          )
          order by d.day desc
        )
        from (
          select
            (created_at at time zone 'utc')::date as day,
            count(*)::bigint as messages,
            count(distinct user_id)::bigint as users
          from public.provider_usage_events
          where kind = 'coach'
            and status = 'completed'
            and created_at >= now() - interval '14 days'
          group by 1
        ) d
      ), '[]'::jsonb),
    'source', 'rpc',
    'privacyNote', 'Counts only — Coach message content is never stored.'
  );
end;
$$;

revoke all on function public.get_coach_usage_summary() from public;
grant execute on function public.get_coach_usage_summary() to service_role;

-- Optional: allow authenticated admins to run the same RPC from SQL editor while signed in.
grant execute on function public.get_coach_usage_summary() to authenticated;
