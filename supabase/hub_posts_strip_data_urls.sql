-- hub_posts_strip_data_urls.sql
--
-- One-shot cleanup + ongoing guard for the Hub feed egress problem.
--
-- Why this exists
-- ----------------
-- The Hub list endpoint was returning ~33 MB per fetch for 30 rows, i.e.
-- ~1 MB per row. The list `select=` deliberately omits the big JSONB
-- columns (`proof`, `meta`), so the only remaining offenders are TEXT
-- columns that legacy clients populated with full base64 `data:` URLs:
--   - `cover_url`          (custom song covers chosen by the user)
--   - `creator_avatar`     (profile photo at publish time)
-- One ~500 KB inline PNG × 30 rows = ~15 MB per request before counting
-- anything else.
--
-- A healthy Hub feed (30 rows, HTTP URLs only) is ~20-60 KB total.
--
-- What this script does
-- ---------------------
--   1. UPDATE: nulls any `cover_url` / `creator_avatar` that starts
--      with `data:`. This is destructive for those two fields on the
--      affected rows — the song itself is untouched. The client falls
--      back to the generic placeholder cover until Phase C re-uploads
--      to Supabase Storage and stores the resulting HTTP URL.
--
--   2. CHECK CONSTRAINT: prevents the column ever being filled with a
--      `data:` URL again from any client. Existing rows still pass
--      because step 1 already cleaned them.
--
-- Run this once in Supabase → SQL editor. Idempotent: safe to re-run.

begin;

update public.hub_posts
   set cover_url = null
 where cover_url is not null
   and cover_url like 'data:%';

update public.hub_posts
   set creator_avatar = null
 where creator_avatar is not null
   and creator_avatar like 'data:%';

-- Drop a prior version of the constraint (if any) before recreating.
alter table public.hub_posts
  drop constraint if exists hub_posts_no_data_urls;

alter table public.hub_posts
  add constraint hub_posts_no_data_urls
  check (
    (cover_url is null      or cover_url      not like 'data:%') and
    (creator_avatar is null or creator_avatar not like 'data:%')
  );

commit;

-- Optional verification (run separately afterwards):
--   select count(*) as bad_rows
--     from public.hub_posts
--    where cover_url like 'data:%' or creator_avatar like 'data:%';
-- Expected: 0
