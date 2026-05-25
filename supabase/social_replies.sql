-- Polymorphic reply / comment thread for the Friends / Profile feed.
--
-- A reply targets one of three kinds:
--   * 'song'   — public_on_profile = true rows in public.user_songs
--   * 'status' — rows in public.social_status_posts
--   * 'echo'   — rows in public.social_echoes (24h ephemeral)
--
-- Replies are publicly readable (threads are public on Friends + Profile
-- feed). Only the author can insert their own row; only the author can
-- delete their own reply.  Length cap matches X / Twitter at 280 chars.

create table if not exists public.social_replies (
  id uuid primary key default gen_random_uuid(),
  target_kind text not null check (target_kind in ('song', 'status', 'echo')),
  target_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) > 0 and char_length(body) <= 280),
  created_at timestamptz not null default now()
);

create index if not exists social_replies_target_idx
  on public.social_replies (target_kind, target_id, created_at desc);

create index if not exists social_replies_user_idx
  on public.social_replies (user_id, created_at desc);

alter table public.social_replies enable row level security;

drop policy if exists "replies are publicly readable" on public.social_replies;
create policy "replies are publicly readable"
  on public.social_replies for select
  using (true);

drop policy if exists "users can reply as themselves" on public.social_replies;
create policy "users can reply as themselves"
  on public.social_replies for insert
  with check (auth.uid() = user_id);

drop policy if exists "users can delete their own reply" on public.social_replies;
create policy "users can delete their own reply"
  on public.social_replies for delete
  using (auth.uid() = user_id);
