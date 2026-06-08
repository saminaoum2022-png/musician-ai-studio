-- One-time purge: remove all retired status posts (UPDATE, SONG REQUEST, etc.).
-- Run once in Supabase SQL editor after deploying the app change that stops reading this table.
-- Song drops in Friends come from public library tracks, not this table.

delete from public.social_status_posts;

-- Optional: verify empty
-- select count(*) from public.social_status_posts;
