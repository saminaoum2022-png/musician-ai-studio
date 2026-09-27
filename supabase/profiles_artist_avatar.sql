-- Nabad Artist Avatar — canonical generated portrait, synced like the regular
-- avatar (client upserts `artist_avatar` directly onto profiles, no separate
-- table/bucket for v1). Run once in Supabase SQL editor.

alter table public.profiles
  add column if not exists artist_avatar text,
  add column if not exists artist_avatar_updated_at timestamptz,
  add column if not exists artist_avatar_consented_at timestamptz;

comment on column public.profiles.artist_avatar is
  'Chosen Nabad Artist Avatar as a data: URL (same storage convention as profiles.avatar) — the stylized generated portrait, distinct from the real photo.';
comment on column public.profiles.artist_avatar_consented_at is
  'When the user consented to uploading face photos for Artist Avatar generation — kept even if they later clear the avatar, so we do not re-prompt consent on every regen.';
