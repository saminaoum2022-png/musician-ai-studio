-- DM Voice Drop + delivery setup check
-- Paste into Supabase Dashboard → SQL Editor → Run
-- Each row tells you ✅ done or ❌ still needed.

-- 1) dm_voice storage bucket
select
  case
    when not exists (select 1 from storage.buckets where id = 'dm_voice')
      then '❌ MISSING — run supabase/dm_voice_storage.sql'
    when not (select public from storage.buckets where id = 'dm_voice')
      then '⚠️  Bucket exists but NOT public — re-run supabase/dm_voice_storage.sql'
    else '✅ dm_voice bucket exists and is public'
  end as status;

select id, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'dm_voice';

-- 2) delivered_at column (✓D ticks)
select
  case
    when exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'dm_messages'
        and column_name = 'delivered_at'
    )
      then '✅ delivered_at column exists'
    else '❌ MISSING — run supabase/dm_messages_delivered.sql'
  end as status;

-- 3) dm_messages body length (voice JSON needs up to 2000 chars)
select
  case
    when not exists (
      select 1 from pg_constraint where conname = 'dm_messages_body_check'
    )
      then '⚠️  No body length constraint found'
    when exists (
      select 1 from pg_constraint
      where conname = 'dm_messages_body_check'
        and pg_get_constraintdef(oid) like '%2000%'
    )
      then '✅ body allows up to 2000 characters'
    when exists (
      select 1 from pg_constraint
      where conname = 'dm_messages_body_check'
        and pg_get_constraintdef(oid) like '%500%'
    )
      then '❌ Still capped at 500 — run supabase/dm_messages_body_2000.sql'
    else '⚠️  Unknown body constraint — inspect pg_constraint'
  end as status;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conname = 'dm_messages_body_check';

-- 4) Recent voice uploads (should be tens of KB+, not ~14 bytes)
select
  name,
  coalesce((metadata->>'size')::bigint, 0) as bytes,
  case
    when coalesce((metadata->>'size')::bigint, 0) < 500
      then '❌ File too small — recording/upload bug on device'
    else '✅ Size looks OK'
  end as size_check,
  created_at
from storage.objects
where bucket_id = 'dm_voice'
order by created_at desc
limit 10;
