-- Reposts: a user reshares someone else's public song into their followers'
-- Friends feed, with an optional note. Mirrors the polymorphic shape used by
-- social_likes / social_replies so we can extend target_kind later.
--
-- Run this once in the Supabase SQL editor.

create table if not exists public.social_reposts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_kind text not null default 'song',
  target_id uuid not null,
  -- Denormalized original author so we can query "reposts of my songs"
  -- and build notifications without an extra join.
  target_user_id uuid,
  -- Optional quote note (capped in the API layer).
  body text,
  created_at timestamptz not null default now(),
  constraint social_reposts_one_per_target unique (user_id, target_kind, target_id)
);

create index if not exists social_reposts_user_idx
  on public.social_reposts (user_id, created_at desc);
create index if not exists social_reposts_target_idx
  on public.social_reposts (target_kind, target_id);
create index if not exists social_reposts_target_user_idx
  on public.social_reposts (target_user_id, created_at desc);

alter table public.social_reposts enable row level security;

-- Reposts are public (feed content).
drop policy if exists social_reposts_select_all on public.social_reposts;
create policy social_reposts_select_all
  on public.social_reposts for select
  using (true);

-- A user can only create / delete their own reposts.
drop policy if exists social_reposts_insert_own on public.social_reposts;
create policy social_reposts_insert_own
  on public.social_reposts for insert
  with check (auth.uid() = user_id);

drop policy if exists social_reposts_delete_own on public.social_reposts;
create policy social_reposts_delete_own
  on public.social_reposts for delete
  using (auth.uid() = user_id);
