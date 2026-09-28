-- DM message reactions (v1: heart only). Run once in Supabase SQL editor.
-- Used by /api/messages react_message / unreact_message and thread GET summaries.

create table if not exists public.dm_message_reactions (
  message_id uuid not null references public.dm_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null default 'heart',
  created_at timestamptz not null default now(),
  primary key (message_id, user_id),
  constraint dm_message_reactions_kind check (reaction in ('heart'))
);

create index if not exists dm_message_reactions_message_idx
  on public.dm_message_reactions (message_id);

alter table public.dm_message_reactions enable row level security;

drop policy if exists "dm_message_reactions_select_participant" on public.dm_message_reactions;
create policy "dm_message_reactions_select_participant"
  on public.dm_message_reactions for select
  using (
    exists (
      select 1
      from public.dm_messages m
      join public.dm_threads t on t.id = m.thread_id
      where m.id = dm_message_reactions.message_id
        and (t.user_a = auth.uid() or t.user_b = auth.uid())
    )
  );

drop policy if exists "dm_message_reactions_insert_own" on public.dm_message_reactions;
create policy "dm_message_reactions_insert_own"
  on public.dm_message_reactions for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.dm_messages m
      join public.dm_threads t on t.id = m.thread_id
      where m.id = dm_message_reactions.message_id
        and (t.user_a = auth.uid() or t.user_b = auth.uid())
    )
  );

drop policy if exists "dm_message_reactions_delete_own" on public.dm_message_reactions;
create policy "dm_message_reactions_delete_own"
  on public.dm_message_reactions for delete
  using (auth.uid() = user_id);

comment on table public.dm_message_reactions is 'Per-user reactions on DM messages (v1: heart via double-tap)';
