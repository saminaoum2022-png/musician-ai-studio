-- purge_hub_posts.sql
--
-- Retired Hub feed table (~95 MB / ~55% of DB in prod observability).
-- The app no longer reads or writes hub_posts (HUB_FEATURE_ENABLED=false).
-- Songs live in user_songs; share links /s/:id resolve via user_songs only.
--
-- Run once in Supabase → SQL editor (production).
-- Deploy api/share.js + api/social.js hub_posts removal first (no live queries).
--
-- Optional audit — run separately and save the count before dropping:
--   select count(*) as hub_post_rows from public.hub_posts;
--   select pg_size_pretty(pg_total_relation_size('public.hub_posts')) as hub_posts_size;

begin;

drop table if exists public.hub_posts cascade;

commit;

-- Space is reclaimed after drop; Supabase runs autovacuum. Re-check disk in
-- Dashboard → Observability → Database after a few minutes.
