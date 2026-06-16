-- P1 perf: aggregated social stats without limit=10000 row scans.
-- Run in Supabase SQL Editor (alongside social_song_play_counts_rpc.sql).

-- Batch like + reply counts for feed_social_stats (Friends / Profile actions row).
create or replace function public.social_target_stats(
  p_target_kind text,
  p_target_ids uuid[],
  p_viewer_id uuid default null
)
returns table(
  target_id uuid,
  like_count bigint,
  reply_count bigint,
  viewer_liked boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    tid as target_id,
    coalesce(l.c, 0)::bigint as like_count,
    coalesce(r.c, 0)::bigint as reply_count,
    case
      when p_viewer_id is null then false
      else exists (
        select 1
        from public.social_likes sl
        where sl.target_kind = p_target_kind
          and sl.target_id = tid
          and sl.user_id = p_viewer_id
      )
    end as viewer_liked
  from unnest(p_target_ids) as tid
  left join (
    select target_id, count(*)::bigint as c
    from public.social_likes
    where target_kind = p_target_kind
      and target_id = any (p_target_ids)
    group by target_id
  ) l on l.target_id = tid
  left join (
    select target_id, count(*)::bigint as c
    from public.social_replies
    where target_kind = p_target_kind
      and target_id = any (p_target_ids)
    group by target_id
  ) r on r.target_id = tid;
$$;

grant execute on function public.social_target_stats(text, uuid[], uuid) to service_role;

-- Weekly chart: plays + feedback grouped by song for current vs previous 7-day windows.
create or replace function public.social_weekly_engagement(
  p_two_weeks_ago timestamptz,
  p_week_ago timestamptz
)
returns table(
  song_id text,
  cur_plays bigint,
  prev_plays bigint,
  cur_feedback bigint,
  prev_feedback bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with plays as (
    select
      p.song_id::text as song_id,
      count(*) filter (where p.created_at >= p_week_ago)::bigint as cur_plays,
      count(*) filter (
        where p.created_at >= p_two_weeks_ago and p.created_at < p_week_ago
      )::bigint as prev_plays
    from public.social_song_plays p
    where p.created_at >= p_two_weeks_ago
    group by p.song_id
  ),
  feedback as (
    select
      f.song_id::text as song_id,
      count(*) filter (where f.created_at >= p_week_ago)::bigint as cur_feedback,
      count(*) filter (
        where f.created_at >= p_two_weeks_ago and f.created_at < p_week_ago
      )::bigint as prev_feedback
    from public.social_song_feedback f
    where f.created_at >= p_two_weeks_ago
    group by f.song_id
  ),
  all_sids as (
    select song_id from plays
    union
    select song_id from feedback
  )
  select
    a.song_id,
    coalesce(p.cur_plays, 0)::bigint as cur_plays,
    coalesce(p.prev_plays, 0)::bigint as prev_plays,
    coalesce(f.cur_feedback, 0)::bigint as cur_feedback,
    coalesce(f.prev_feedback, 0)::bigint as prev_feedback
  from all_sids a
  left join plays p on p.song_id = a.song_id
  left join feedback f on f.song_id = a.song_id;
$$;

grant execute on function public.social_weekly_engagement(timestamptz, timestamptz) to service_role;

-- Profile header stats: one round-trip instead of 3 HEAD counts + 2 follow lookups.
create or replace function public.social_profile_stats(
  p_user_id uuid,
  p_viewer_id uuid default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'followers', (
      select count(*)::int from public.social_follows f where f.following_user_id = p_user_id
    ),
    'following', (
      select count(*)::int from public.social_follows f where f.follower_user_id = p_user_id
    ),
    'plays', (
      select count(*)::int from public.social_song_plays p where p.owner_user_id = p_user_id
    ),
    'is_following', case
      when p_viewer_id is null then false
      else exists (
        select 1 from public.social_follows f
        where f.follower_user_id = p_viewer_id and f.following_user_id = p_user_id
      )
    end,
    'follows_viewer', case
      when p_viewer_id is null then false
      else exists (
        select 1 from public.social_follows f
        where f.follower_user_id = p_user_id and f.following_user_id = p_viewer_id
      )
    end
  );
$$;

grant execute on function public.social_profile_stats(uuid, uuid) to service_role;
