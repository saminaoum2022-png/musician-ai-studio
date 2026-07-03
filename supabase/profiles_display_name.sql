-- Display name (cosmetic) + username change cooldown anchor.
-- Run once in Supabase SQL editor.
--
-- Client limits (enforced in app): username 24 chars, display_name 30 chars.

alter table public.profiles
  add column if not exists display_name text default '';

alter table public.profiles
  add column if not exists username_changed_at timestamptz;
