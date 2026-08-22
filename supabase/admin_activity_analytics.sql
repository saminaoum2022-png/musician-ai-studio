-- Admin activity analytics — daily trends + live user count.
-- Run in Supabase SQL Editor (production / shared DB).
--
-- Powers admin Overview: activity graph (signups, generations, engaged users,
-- publishes) and "online now" (last_active_at within 15 minutes).

create or replace function public.get_admin_activity_summary(p_days int default 28)
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
    'activeNow',
      (select count(*)::bigint from public.profiles
       where last_active_at >= now() - interval '15 minutes'),
    'activeToday',
      (select count(*)::bigint from public.profiles
       where last_active_at >= v_today),
    'days', v_days,
    'daily',
      coalesce((
        with day_series as (
          select (v_today::date - offs)::text as day
          from generate_series(0, v_days - 1) as offs
        ),
        signup_counts as (
          select (created_at at time zone 'utc')::date::text as day,
                 count(*)::bigint as signups
          from public.profiles
          where created_at >= v_start
          group by 1
        ),
        gen_counts as (
          select (created_at at time zone 'utc')::date::text as day,
                 count(*)::bigint as generations,
                 count(distinct user_id)::bigint as engaged_users
          from public.music_generation_logs
          where created_at >= v_start
          group by 1
        ),
        publish_counts as (
          select (published_at at time zone 'utc')::date::text as day,
                 count(*)::bigint as published
          from public.user_songs
          where public_on_profile = true
            and published_at is not null
            and published_at >= v_start
          group by 1
        )
        select jsonb_agg(
          jsonb_build_object(
            'day', ds.day,
            'signups', coalesce(s.signups, 0),
            'generations', coalesce(g.generations, 0),
            'engagedUsers', coalesce(g.engaged_users, 0),
            'published', coalesce(p.published, 0)
          )
          order by ds.day asc
        )
        from day_series ds
        left join signup_counts s on s.day = ds.day
        left join gen_counts g on g.day = ds.day
        left join publish_counts p on p.day = ds.day
      ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_admin_activity_summary(int) from public;
grant execute on function public.get_admin_activity_summary(int) to service_role;
