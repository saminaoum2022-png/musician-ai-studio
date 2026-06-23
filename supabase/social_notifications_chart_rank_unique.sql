-- Prevent duplicate chart-rank rows caused by concurrent weekly_chart requests.
-- Safe to run multiple times.

with ranked as (
  select
    ctid,
    row_number() over (
      partition by user_id, type, entity_id
      order by created_at desc, id desc
    ) as rn
  from public.social_notifications
  where type = 'chart_rank'
    and entity_id is not null
)
delete from public.social_notifications n
using ranked r
where n.ctid = r.ctid
  and r.rn > 1;

create unique index if not exists social_notifications_chart_rank_entity_uq
  on public.social_notifications (user_id, type, entity_id)
  where type = 'chart_rank'
    and entity_id is not null;
