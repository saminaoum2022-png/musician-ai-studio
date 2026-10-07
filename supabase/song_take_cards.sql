-- Take 2 — persist Create inputs + producer JSON + final Lyria prompt per generation.
-- API uses the service role. RLS is on with no client policies (anon/authenticated denied).
-- Run once in the Supabase SQL editor (shared DB — this only adds a table; old songs unchanged).

create table if not exists public.song_take_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  song_id uuid,
  local_song_id text,
  task_id text not null,
  parent_song_id text,
  parent_task_id text,
  create_inputs jsonb not null default '{}'::jsonb,
  producer_json jsonb,
  final_prompt text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists song_take_cards_task_id_uidx
  on public.song_take_cards (task_id);

create index if not exists song_take_cards_user_parent_idx
  on public.song_take_cards (user_id, parent_song_id, created_at desc);

create index if not exists song_take_cards_user_parent_task_idx
  on public.song_take_cards (user_id, parent_task_id, created_at desc);

alter table public.song_take_cards enable row level security;
