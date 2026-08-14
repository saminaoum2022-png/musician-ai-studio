-- Quick check: all three Pro Singer tables exist.
-- Run in Supabase SQL Editor. Expect 3 rows if setup is complete.

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('singer_applications', 'pro_singers', 'pro_singer_requests')
order by table_name;
