-- Allow MiniMax in music_generation_logs provider enum (shared Supabase).
-- Safe to run once on production/staging (idempotent).

alter table public.music_generation_logs
  drop constraint if exists music_generation_logs_provider_check;

alter table public.music_generation_logs
  add constraint music_generation_logs_provider_check
  check (provider in ('suno', 'minimax', 'other'));
