-- Melody Lock — Lyria run scores + admin ear check (Phase 2)
-- Requires melody_lock_sources. Apply before MELODY_LOCK generate on production.

create table if not exists public.melody_lock_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  task_id text not null,
  melody_lock_id uuid not null references public.melody_lock_sources (id) on delete cascade,
  melody_similarity numeric,
  melody_similarity_components jsonb not null default '{}'::jsonb,
  melody_lock_attempt int not null default 1,
  melody_lock_score_pass boolean not null default false,
  melody_lock_ear_pass text not null default 'pending'
    check (melody_lock_ear_pass in ('pending', 'pass', 'fail')),
  admin_ear_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id)
);

create index if not exists melody_lock_runs_user_created_idx
  on public.melody_lock_runs (user_id, created_at desc);

alter table public.melody_lock_runs enable row level security;

drop policy if exists melody_lock_runs_select_own on public.melody_lock_runs;
create policy melody_lock_runs_select_own
  on public.melody_lock_runs for select
  using (auth.uid() = user_id);
