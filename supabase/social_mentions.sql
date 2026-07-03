-- @username mentions in reply threads and song release captions.
-- Notifications are created server-side for mutual followers only.

create table if not exists public.social_mentions (
  id uuid primary key default gen_random_uuid(),
  source_kind text not null check (source_kind in ('reply', 'song_caption')),
  source_id uuid not null,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  mentioned_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint social_mentions_unique unique (source_kind, source_id, mentioned_user_id),
  constraint social_mentions_not_self check (actor_user_id <> mentioned_user_id)
);

create index if not exists social_mentions_user_idx
  on public.social_mentions (mentioned_user_id, created_at desc);

create index if not exists social_mentions_source_idx
  on public.social_mentions (source_kind, source_id);

alter table public.social_mentions enable row level security;

drop policy if exists "social_mentions_select_involved" on public.social_mentions;
create policy "social_mentions_select_involved"
  on public.social_mentions for select
  using (auth.uid() = actor_user_id or auth.uid() = mentioned_user_id);

-- Inserts are service-role only (API).
