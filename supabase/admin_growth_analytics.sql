-- Admin growth / activation analytics — generation-depth buckets + Pro overlap.
-- Run in Supabase SQL Editor (production / shared DB).
--
-- Powers admin Overview "Growth" section:
--   signups, % who generated ≥1, buckets 0 / 1 / 2–5 / 6–10 / 11+, Pro per bucket.

create or replace function public.get_admin_growth_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_signups bigint := 0;
  v_pro_total bigint := 0;
  v_bucket_0 bigint := 0;
  v_bucket_1 bigint := 0;
  v_bucket_2_5 bigint := 0;
  v_bucket_6_10 bigint := 0;
  v_bucket_11_plus bigint := 0;
  v_pro_0 bigint := 0;
  v_pro_1 bigint := 0;
  v_pro_2_5 bigint := 0;
  v_pro_6_10 bigint := 0;
  v_pro_11_plus bigint := 0;
begin
  with gen_counts as (
    select user_id, count(*)::bigint as gens
    from public.music_generation_logs
    where user_id is not null
    group by user_id
  ),
  pro_users as (
    select distinct user_id
    from public.pro_subscriptions
    where status in ('active', 'trialing', 'grace')
      and user_id is not null
  ),
  user_rows as (
    select
      p.user_id,
      coalesce(g.gens, 0)::bigint as gens,
      (pu.user_id is not null) as is_pro
    from public.profiles p
    left join gen_counts g on g.user_id = p.user_id
    left join pro_users pu on pu.user_id = p.user_id
  )
  select
    count(*)::bigint,
    count(*) filter (where is_pro)::bigint,
    count(*) filter (where gens = 0)::bigint,
    count(*) filter (where gens = 1)::bigint,
    count(*) filter (where gens between 2 and 5)::bigint,
    count(*) filter (where gens between 6 and 10)::bigint,
    count(*) filter (where gens >= 11)::bigint,
    count(*) filter (where is_pro and gens = 0)::bigint,
    count(*) filter (where is_pro and gens = 1)::bigint,
    count(*) filter (where is_pro and gens between 2 and 5)::bigint,
    count(*) filter (where is_pro and gens between 6 and 10)::bigint,
    count(*) filter (where is_pro and gens >= 11)::bigint
  into
    v_signups,
    v_pro_total,
    v_bucket_0,
    v_bucket_1,
    v_bucket_2_5,
    v_bucket_6_10,
    v_bucket_11_plus,
    v_pro_0,
    v_pro_1,
    v_pro_2_5,
    v_pro_6_10,
    v_pro_11_plus
  from user_rows;

  return jsonb_build_object(
    'signups', coalesce(v_signups, 0),
    'proTotal', coalesce(v_pro_total, 0),
    'generatedAtLeast1', coalesce(v_signups, 0) - coalesce(v_bucket_0, 0),
    'buckets', jsonb_build_array(
      jsonb_build_object('id', '0', 'label', '0 gens', 'min', 0, 'max', 0, 'users', coalesce(v_bucket_0, 0), 'pro', coalesce(v_pro_0, 0)),
      jsonb_build_object('id', '1', 'label', '1 gen', 'min', 1, 'max', 1, 'users', coalesce(v_bucket_1, 0), 'pro', coalesce(v_pro_1, 0)),
      jsonb_build_object('id', '2-5', 'label', '2–5 gens', 'min', 2, 'max', 5, 'users', coalesce(v_bucket_2_5, 0), 'pro', coalesce(v_pro_2_5, 0)),
      jsonb_build_object('id', '6-10', 'label', '6–10 gens', 'min', 6, 'max', 10, 'users', coalesce(v_bucket_6_10, 0), 'pro', coalesce(v_pro_6_10, 0)),
      jsonb_build_object('id', '11+', 'label', '11+ gens', 'min', 11, 'max', null, 'users', coalesce(v_bucket_11_plus, 0), 'pro', coalesce(v_pro_11_plus, 0))
    ),
    'note', 'Buckets count generation requests (any status) per account. Pro = active / trialing / grace.'
  );
end;
$$;

revoke all on function public.get_admin_growth_summary() from public;
grant execute on function public.get_admin_growth_summary() to service_role;
