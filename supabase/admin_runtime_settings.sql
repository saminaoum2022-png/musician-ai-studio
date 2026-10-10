-- Admin runtime knobs (Lyria prompt flags, etc.).
-- Shared Supabase: this table is used by staging and production APIs.
-- Run in the Supabase SQL Editor once.

create table if not exists public.admin_runtime_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

comment on table public.admin_runtime_settings is
  'Owner/Admin kill switches read by the API at generate time. No deploy needed to flip.';

alter table public.admin_runtime_settings enable row level security;

-- No client policies — Vercel service role only.

insert into public.admin_runtime_settings (key, value)
values ('arabizi_instruction', 'true'::jsonb)
on conflict (key) do nothing;
