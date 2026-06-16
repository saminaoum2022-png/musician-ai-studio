-- Discover survival (OPTIONAL — scoring is paused in the app today).
-- Run in Supabase SQL Editor when you want score-based expiry on Discover.
-- Until then, the app does not SELECT these columns (avoids Postgres errors
-- when the migration has not been applied).

alter table public.user_songs
  add column if not exists discover_score integer;

alter table public.user_songs
  add column if not exists discover_expires_at timestamptz;

create index if not exists user_songs_discover_active_idx
  on public.user_songs (discover_expires_at desc nulls last, published_at desc nulls last)
  where public_on_profile is true;

-- After running: Supabase Dashboard → Project Settings → API → Reload schema
-- (or wait ~1 min). Otherwise PATCH may fail until PostgREST picks up new columns.

notify pgrst, 'reload schema';
