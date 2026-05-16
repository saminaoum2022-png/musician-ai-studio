-- Internal social graph + in-app notifications.
-- No push notifications, no cron. Notifications are created during user actions.

create table if not exists public.social_follows (
  follower_user_id uuid not null references auth.users(id) on delete cascade,
  following_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_user_id, following_user_id),
  constraint social_follows_not_self check (follower_user_id <> following_user_id)
);

create index if not exists social_follows_following_idx
  on public.social_follows (following_user_id, created_at desc);

create table if not exists public.social_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.social_song_plays (
  id uuid primary key default gen_random_uuid(),
  song_id text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  listener_user_id uuid not null references auth.users(id) on delete cascade,
  play_day date not null default current_date,
  listened_seconds integer not null default 0,
  created_at timestamptz not null default now(),
  constraint social_song_plays_not_owner check (owner_user_id <> listener_user_id),
  constraint social_song_plays_one_per_listener_day unique (song_id, listener_user_id, play_day)
);

create index if not exists social_notifications_user_unread_idx
  on public.social_notifications (user_id, read_at, created_at desc);

create index if not exists social_song_plays_owner_idx
  on public.social_song_plays (owner_user_id, created_at desc);

create index if not exists social_song_plays_song_idx
  on public.social_song_plays (song_id, created_at desc);

alter table public.social_follows enable row level security;
alter table public.social_notifications enable row level security;
alter table public.social_song_plays enable row level security;

drop policy if exists "social_follows_select_own" on public.social_follows;
create policy "social_follows_select_own"
  on public.social_follows for select
  using (auth.uid() = follower_user_id or auth.uid() = following_user_id);

drop policy if exists "social_follows_insert_own" on public.social_follows;
create policy "social_follows_insert_own"
  on public.social_follows for insert
  with check (auth.uid() = follower_user_id);

drop policy if exists "social_follows_delete_own" on public.social_follows;
create policy "social_follows_delete_own"
  on public.social_follows for delete
  using (auth.uid() = follower_user_id);

drop policy if exists "social_notifications_select_own" on public.social_notifications;
create policy "social_notifications_select_own"
  on public.social_notifications for select
  using (auth.uid() = user_id);

drop policy if exists "social_notifications_update_own" on public.social_notifications;
create policy "social_notifications_update_own"
  on public.social_notifications for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "social_song_plays_select_related" on public.social_song_plays;
create policy "social_song_plays_select_related"
  on public.social_song_plays for select
  using (auth.uid() = owner_user_id or auth.uid() = listener_user_id);

comment on table public.social_follows is
  'Creator follow graph. Push is intentionally not required; the app reads this when opened.';

comment on table public.social_notifications is
  'In-app notification inbox. Rows are created by app/API actions, not by cron or push jobs.';

comment on table public.social_song_plays is
  'Daily de-duped counted plays for public songs. Own plays are rejected by constraint and API.';
