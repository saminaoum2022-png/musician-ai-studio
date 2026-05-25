-- Polymorphic like table for the Friends / Profile feed.
--
-- A like targets one of three kinds:
--   * 'song'   — public_on_profile = true rows in public.user_songs
--   * 'status' — rows in public.social_status_posts
--   * 'echo'   — rows in public.social_echoes (24h ephemeral)
--
-- Counts are public so anyone can read; only the liker can insert / delete
-- their own row.  Unique constraint enforces one like per (target, user).

create table if not exists public.social_likes (
  id uuid primary key default gen_random_uuid(),
  target_kind text not null check (target_kind in ('song', 'status', 'echo')),
  target_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (target_kind, target_id, user_id)
);

create index if not exists social_likes_target_idx
  on public.social_likes (target_kind, target_id);

create index if not exists social_likes_user_idx
  on public.social_likes (user_id, created_at desc);

alter table public.social_likes enable row level security;

drop policy if exists "likes are publicly readable" on public.social_likes;
create policy "likes are publicly readable"
  on public.social_likes for select
  using (true);

drop policy if exists "users can like as themselves" on public.social_likes;
create policy "users can like as themselves"
  on public.social_likes for insert
  with check (auth.uid() = user_id);

drop policy if exists "users can remove their own like" on public.social_likes;
create policy "users can remove their own like"
  on public.social_likes for delete
  using (auth.uid() = user_id);
