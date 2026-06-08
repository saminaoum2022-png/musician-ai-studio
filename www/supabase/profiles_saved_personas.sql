-- Saved voice personas (Suno personaId bookmarks) sync to the user's account.
-- Run once in Supabase SQL editor. The app upserts `saved_personas` on save/delete/rename.

alter table public.profiles
  add column if not exists saved_personas jsonb not null default '[]'::jsonb;

comment on column public.profiles.saved_personas is
  'Array of {personaId, label, type, personaModel, ts} — synced from the client so voices survive reinstall and new devices.';
