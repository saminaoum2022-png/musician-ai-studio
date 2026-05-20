-- Text updates on the Following feed (status, advice, brainstorm, song request, recommend).
-- No push/cron; rows are created when the user taps Post in the app.

create table if not exists public.social_status_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  post_type text not null default 'update',
  body text not null,
  created_at timestamptz not null default now(),
  constraint social_status_posts_body_len check (char_length(body) between 1 and 320),
  constraint social_status_posts_type check (
    post_type in ('update', 'advice', 'brainstorm', 'song_request', 'recommend')
  )
);

create index if not exists social_status_posts_user_created_idx
  on public.social_status_posts (user_id, created_at desc);

create index if not exists social_status_posts_created_idx
  on public.social_status_posts (created_at desc);

alter table public.social_status_posts enable row level security;

drop policy if exists "social_status_posts_select_auth" on public.social_status_posts;
create policy "social_status_posts_select_auth"
  on public.social_status_posts for select
  to authenticated
  using (true);

drop policy if exists "social_status_posts_insert_own" on public.social_status_posts;
create policy "social_status_posts_insert_own"
  on public.social_status_posts for insert
  to authenticated
  with check (auth.uid() = user_id);

comment on table public.social_status_posts is
  'Following feed text posts: status, advice requests, brainstorm, song requests, recommendations.';
