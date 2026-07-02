-- Music style preferences on public.profiles (comma-separated genre labels).
-- Safe to run once on existing projects; no-op if column already exists.

alter table public.profiles
  add column if not exists genres text not null default '';

comment on column public.profiles.genres is
  'Comma-separated music genre labels for personalization (e.g. Arabic Pop,House,EDM).';
