-- Per-user "delete chat" — hides a thread from inbox until a newer message arrives.
-- Run once in Supabase SQL editor (production + staging share DB today).

create table if not exists public.dm_thread_hides (
  user_id uuid not null references auth.users(id) on delete cascade,
  thread_id uuid not null references public.dm_threads(id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (user_id, thread_id)
);

create index if not exists dm_thread_hides_user_idx
  on public.dm_thread_hides (user_id, hidden_at desc);

alter table public.dm_thread_hides enable row level security;

drop policy if exists "dm_thread_hides_select_own" on public.dm_thread_hides;
create policy "dm_thread_hides_select_own"
  on public.dm_thread_hides for select
  using (auth.uid() = user_id);

drop policy if exists "dm_thread_hides_insert_own" on public.dm_thread_hides;
create policy "dm_thread_hides_insert_own"
  on public.dm_thread_hides for insert
  with check (auth.uid() = user_id);

drop policy if exists "dm_thread_hides_update_own" on public.dm_thread_hides;
create policy "dm_thread_hides_update_own"
  on public.dm_thread_hides for update
  using (auth.uid() = user_id);

drop policy if exists "dm_thread_hides_delete_own" on public.dm_thread_hides;
create policy "dm_thread_hides_delete_own"
  on public.dm_thread_hides for delete
  using (auth.uid() = user_id);
