-- Gold member cosmetics (avatar ring, emblem, later caption/profile styling).
-- One additive, nullable column — safe on the shared database. The app reads and writes it
-- in its own error-tolerant request, so nothing else breaks if this has not been run yet.
--
-- Run once in Supabase SQL editor. Until then, Gold styling only shows on the device that set it.

alter table public.profiles
  add column if not exists gold_style jsonb;

comment on column public.profiles.gold_style is
  'Gold member cosmetics, e.g. {"ring":"gold","topper":"crown"}. Null = none. Written by the owner via PATCH; read publicly with the rest of the profile row.';
