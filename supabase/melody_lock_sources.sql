-- Melody Lock — analyzed hum/whistle/sing sources (Phase 1+)
-- Apply on shared Supabase before enabling MELODY_LOCK_ENABLED=1.

create table if not exists public.melody_lock_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_kind text not null default 'hum' check (source_kind in ('hum', 'whistle', 'sing')),
  source_audio_url text,
  source_duration_sec numeric,
  melody_json jsonb not null default '{}'::jsonb,
  quantized_notes jsonb not null default '[]'::jsonb,
  inferred_bpm int,
  inferred_key text,
  contour_summary text,
  lyria_melody_block text,
  lyria_prompt_preview text,
  analyze_provider text,
  created_at timestamptz not null default now()
);

create index if not exists melody_lock_sources_user_created_idx
  on public.melody_lock_sources (user_id, created_at desc);

alter table public.melody_lock_sources enable row level security;

drop policy if exists melody_lock_sources_select_own on public.melody_lock_sources;
create policy melody_lock_sources_select_own
  on public.melody_lock_sources for select
  using (auth.uid() = user_id);

drop policy if exists melody_lock_sources_insert_own on public.melody_lock_sources;
create policy melody_lock_sources_insert_own
  on public.melody_lock_sources for insert
  with check (auth.uid() = user_id);

-- Service role (API) bypasses RLS for admin analyze path.
