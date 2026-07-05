-- Tracks in-flight Suno tasks so callback webhooks can send push when jobs finish.
-- Service role only — no client reads/writes.

create table if not exists public.suno_generation_watch (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id text not null,
  kind text not null,
  title text not null default '',
  variant_count int not null default 1,
  notify_push boolean not null default true,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  notified_at timestamptz,
  constraint suno_generation_watch_kind_check
    check (kind in ('song', 'photo', 'sound', 'hum_track', 'instrumental', 'music_video', 'studio_guide')),
  constraint suno_generation_watch_status_check
    check (status in ('pending', 'complete', 'failed', 'notified'))
);

create unique index if not exists suno_generation_watch_task_id_uq
  on public.suno_generation_watch (task_id);

create index if not exists suno_generation_watch_user_pending_idx
  on public.suno_generation_watch (user_id, status, created_at desc);

alter table public.suno_generation_watch enable row level security;

comment on table public.suno_generation_watch is
  'Maps Suno task ids to users for completion push alerts. No audio URLs stored.';
