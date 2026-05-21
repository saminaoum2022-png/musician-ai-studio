-- Moments: 24h photo + mood captions (music-social "picks", not status text posts).
-- Run in Supabase SQL Editor after moments_storage.sql bucket exists.

create table if not exists public.social_moments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  image_url text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint social_moments_body_len check (char_length(body) between 1 and 320),
  constraint social_moments_image_len check (char_length(image_url) between 8 and 2048)
);

create index if not exists social_moments_user_created_idx
  on public.social_moments (user_id, created_at desc);

create index if not exists social_moments_expires_idx
  on public.social_moments (expires_at desc);

-- Note: partial indexes cannot use now() in the predicate (not IMMUTABLE).
-- API filters active rows with expires_at > <client timestamp>; expires_idx is enough.

alter table public.social_moments enable row level security;

drop policy if exists "social_moments_select_auth" on public.social_moments;
create policy "social_moments_select_auth"
  on public.social_moments for select
  to authenticated
  using (true);

drop policy if exists "social_moments_insert_own" on public.social_moments;
create policy "social_moments_insert_own"
  on public.social_moments for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "social_moments_delete_own" on public.social_moments;
create policy "social_moments_delete_own"
  on public.social_moments for delete
  to authenticated
  using (auth.uid() = user_id);

comment on table public.social_moments is
  'Ephemeral 24h moments: photo + caption. Shown in Friends pick rail and on profiles.';
