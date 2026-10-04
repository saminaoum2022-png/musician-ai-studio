-- Comment threads and comment likes.
-- Top-level comments keep parent_reply_id null.
-- A reply in a thread points at that top-level comment (one level).
-- Run this on the shared Supabase project before the thread UI can load.

alter table public.social_replies
  add column if not exists parent_reply_id uuid references public.social_replies(id) on delete cascade;

create index if not exists social_replies_parent_idx
  on public.social_replies (parent_reply_id, created_at asc);

create table if not exists public.social_reply_likes (
  reply_id uuid not null references public.social_replies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reply_id, user_id)
);

create index if not exists social_reply_likes_user_idx
  on public.social_reply_likes (user_id, created_at desc);

alter table public.social_reply_likes enable row level security;

drop policy if exists "reply likes are publicly readable" on public.social_reply_likes;
create policy "reply likes are publicly readable"
  on public.social_reply_likes for select
  using (true);

drop policy if exists "users can like a reply as themselves" on public.social_reply_likes;
create policy "users can like a reply as themselves"
  on public.social_reply_likes for insert
  with check (auth.uid() = user_id);

drop policy if exists "users can remove their own reply like" on public.social_reply_likes;
create policy "users can remove their own reply like"
  on public.social_reply_likes for delete
  using (auth.uid() = user_id);
