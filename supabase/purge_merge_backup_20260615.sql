-- purge_merge_backup_20260615.sql
--
-- One-time snapshot from the June 2026 account merge (683 → c82 / @samynaoum).
-- Not used by the app — only existed for manual rollback via
-- merge_683_into_c82_03_rollback.sql (~15 MB in prod observability).
--
-- Drop only if:
--   • merge_683_into_c82_02_run.sql was COMMITted and you verified your library
--   • you no longer need to undo that merge
--
-- Optional audit before drop:
--   select count(*) from user_songs_merge_backup_20260615;
--   select pg_size_pretty(pg_total_relation_size('user_songs_merge_backup_20260615'));

begin;

drop table if exists public.user_songs_merge_backup_20260615;

commit;
