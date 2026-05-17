-- user_songs — Library cloud sync (see src/app.js: supabaseInsertUserSong)
-- Run in Supabase SQL Editor if inserts/selects fail or return 0 rows unexpectedly.
--
-- Expected columns match POST payload:
--   user_id, title, art_url, song_url, task_id, audio_id, kind, meta

create extension if not exists "pgcrypto";

create table if not exists public.user_songs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text default 'Generated song',
  art_url text default '',
  song_url text default '',
  task_id text default '',
  audio_id text default '',
  kind text default 'full',
  meta jsonb,
  public_on_profile boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.user_songs
  add column if not exists public_on_profile boolean not null default false;

alter table public.user_songs
  add column if not exists published_at timestamptz;

update public.user_songs
  set published_at = created_at
  where public_on_profile is true
    and published_at is null;

create index if not exists user_songs_user_created_idx
  on public.user_songs (user_id, created_at desc);

create index if not exists user_songs_public_published_idx
  on public.user_songs (published_at desc, created_at desc)
  where public_on_profile is true;

create index if not exists user_songs_user_public_published_idx
  on public.user_songs (user_id, published_at desc, created_at desc)
  where public_on_profile is true;

alter table public.user_songs enable row level security;

-- Drop policies if re-running (ignore errors if names differ)
drop policy if exists "user_songs_select_own" on public.user_songs;
drop policy if exists "user_songs_insert_own" on public.user_songs;
drop policy if exists "user_songs_update_own" on public.user_songs;
drop policy if exists "user_songs_delete_own" on public.user_songs;

create policy "user_songs_select_own"
  on public.user_songs for select
  using (auth.uid() = user_id);

create policy "user_songs_insert_own"
  on public.user_songs for insert
  with check (auth.uid() = user_id);

create policy "user_songs_update_own"
  on public.user_songs for update
  using (auth.uid() = user_id);

create policy "user_songs_delete_own"
  on public.user_songs for delete
  using (auth.uid() = user_id);

drop policy if exists "user_songs_select_public_on_profile" on public.user_songs;

create policy "user_songs_select_public_on_profile"
  on public.user_songs for select
  using (public_on_profile is true);
