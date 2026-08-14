-- Verify Phase A columns exist (expect 3 rows).
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'singer_applications' and column_name = 'photo_url')
    or (table_name = 'pro_singers' and column_name = 'photo_url')
    or (table_name = 'pro_singer_requests' and column_name in ('singer_assignment_status', 'singer_decline_reason'))
  )
order by table_name, column_name;

-- Pending gigs for singers (should show your assigned request with pending).
select id, singer_id, singer_assignment_status, song_title, occasion
from public.pro_singer_requests
where singer_id is not null
order by created_at desc
limit 10;
