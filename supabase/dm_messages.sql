-- Direct messages (1:1 threads + message requests for non-mutual follows).
-- Run once in Supabase SQL editor. API uses service role; RLS guards direct client access.

create table if not exists public.dm_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint dm_blocks_not_self check (blocker_id <> blocked_id)
);

create table if not exists public.dm_threads (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  constraint dm_threads_ordered check (user_a < user_b),
  constraint dm_threads_unique_pair unique (user_a, user_b)
);

create index if not exists dm_threads_last_message_idx
  on public.dm_threads (last_message_at desc);

create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.dm_threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) > 0 and char_length(body) <= 500),
  created_at timestamptz not null default now()
);

create index if not exists dm_messages_thread_created_idx
  on public.dm_messages (thread_id, created_at desc);

create table if not exists public.dm_thread_reads (
  thread_id uuid not null references public.dm_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);

create table if not exists public.dm_message_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references auth.users(id) on delete cascade,
  to_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) > 0 and char_length(body) <= 500),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint dm_message_requests_not_self check (from_user_id <> to_user_id)
);

create unique index if not exists dm_message_requests_pending_pair_idx
  on public.dm_message_requests (from_user_id, to_user_id)
  where status = 'pending';

create index if not exists dm_message_requests_to_pending_idx
  on public.dm_message_requests (to_user_id, created_at desc)
  where status = 'pending';

alter table public.dm_blocks enable row level security;
alter table public.dm_threads enable row level security;
alter table public.dm_messages enable row level security;
alter table public.dm_thread_reads enable row level security;
alter table public.dm_message_requests enable row level security;

drop policy if exists "dm_blocks_select_own" on public.dm_blocks;
create policy "dm_blocks_select_own"
  on public.dm_blocks for select
  using (auth.uid() = blocker_id);

drop policy if exists "dm_blocks_insert_own" on public.dm_blocks;
create policy "dm_blocks_insert_own"
  on public.dm_blocks for insert
  with check (auth.uid() = blocker_id);

drop policy if exists "dm_threads_select_participant" on public.dm_threads;
create policy "dm_threads_select_participant"
  on public.dm_threads for select
  using (auth.uid() = user_a or auth.uid() = user_b);

drop policy if exists "dm_messages_select_participant" on public.dm_messages;
create policy "dm_messages_select_participant"
  on public.dm_messages for select
  using (
    exists (
      select 1 from public.dm_threads t
      where t.id = dm_messages.thread_id
        and (t.user_a = auth.uid() or t.user_b = auth.uid())
    )
  );

drop policy if exists "dm_thread_reads_select_own" on public.dm_thread_reads;
create policy "dm_thread_reads_select_own"
  on public.dm_thread_reads for select
  using (auth.uid() = user_id);

drop policy if exists "dm_thread_reads_upsert_own" on public.dm_thread_reads;
create policy "dm_thread_reads_upsert_own"
  on public.dm_thread_reads for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "dm_requests_select_participant" on public.dm_message_requests;
create policy "dm_requests_select_participant"
  on public.dm_message_requests for select
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);
