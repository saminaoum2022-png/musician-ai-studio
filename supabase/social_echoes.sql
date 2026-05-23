-- Echo: ephemeral voice/music moments (24h). Run in Supabase SQL Editor.

create table if not exists public.social_echoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  audio_url text not null,
  duration_ms integer,
  waveform_peaks jsonb,
  body text,
  listen_once boolean not null default false,
  reply_to uuid references public.social_echoes (id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint social_echoes_audio_len check (char_length(audio_url) between 8 and 2048),
  constraint social_echoes_body_len check (body is null or char_length(body) between 1 and 200),
  constraint social_echoes_duration_range check (
    duration_ms is null or (duration_ms >= 0 and duration_ms <= 120000)
  )
);

create index if not exists social_echoes_user_created_idx
  on public.social_echoes (user_id, created_at desc);

create index if not exists social_echoes_expires_idx
  on public.social_echoes (expires_at desc);

create table if not exists public.social_echo_listens (
  echo_id uuid not null references public.social_echoes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  listened_at timestamptz not null default now(),
  primary key (echo_id, user_id)
);

create table if not exists public.social_echo_reactions (
  echo_id uuid not null references public.social_echoes (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  reaction text not null,
  created_at timestamptz not null default now(),
  constraint social_echo_reactions_kind check (reaction in ('fire', 'heart', 'cry', 'eyes')),
  unique (echo_id, user_id)
);

alter table public.social_echoes enable row level security;
alter table public.social_echo_listens enable row level security;
alter table public.social_echo_reactions enable row level security;

drop policy if exists "social_echoes_select_auth" on public.social_echoes;
create policy "social_echoes_select_auth"
  on public.social_echoes for select
  to authenticated
  using (expires_at > now());

drop policy if exists "social_echoes_insert_own" on public.social_echoes;
create policy "social_echoes_insert_own"
  on public.social_echoes for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "social_echoes_delete_own" on public.social_echoes;
create policy "social_echoes_delete_own"
  on public.social_echoes for delete
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "social_echo_listens_select_auth" on public.social_echo_listens;
create policy "social_echo_listens_select_auth"
  on public.social_echo_listens for select
  to authenticated
  using (true);

drop policy if exists "social_echo_listens_insert_own" on public.social_echo_listens;
create policy "social_echo_listens_insert_own"
  on public.social_echo_listens for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "social_echo_reactions_select_auth" on public.social_echo_reactions;
create policy "social_echo_reactions_select_auth"
  on public.social_echo_reactions for select
  to authenticated
  using (true);

drop policy if exists "social_echo_reactions_insert_own" on public.social_echo_reactions;
create policy "social_echo_reactions_insert_own"
  on public.social_echo_reactions for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "social_echo_reactions_update_own" on public.social_echo_reactions;
create policy "social_echo_reactions_update_own"
  on public.social_echo_reactions for update
  to authenticated
  using (auth.uid() = user_id);

comment on table public.social_echoes is '24h ephemeral audio moments (Echo) for creators';
